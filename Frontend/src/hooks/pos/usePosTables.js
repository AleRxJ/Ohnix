import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import { db } from "../../offline/db";
import { getConnectivityState } from "../../offline/connectivity";
import { enqueueOperation, OUTBOX_STATUS } from "../../offline/outbox";
import { mirrorRemove, mirrorReplaceAll, mirrorUpsert, readMirrorAll } from "../../offline/entityQueue";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { useDataInvalidation } from "../useDataInvalidation";
import useI18n from "../useI18n";

// Restaurant mode of the Caja: the location's tables and their open tabs.
// Every change is applied locally first (state + Dexie mirror), then sent
// straight to the API when online - or queued in the outbox when offline, or
// when earlier table operations are still queued (so a tab opened offline
// always reaches the server before the items added to it). Tab and line ids
// are generated here, which is what makes queued writes safe to replay.
//
// Also carries the two signals a waiter reacts to: the kitchen marking one
// of THEIR tables' rounds "ready" (onKitchenReady) and a customer sending
// something from a table's QR (onNewRequest).

const ENTITY = "tableTabs";
const REQUESTS = "tableRequests";
const newId = () => crypto.randomUUID();

const withTotals = (tab) => {
    const items = tab.items || [];
    return {
        ...tab,
        subtotal: items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
        unsent_count: items.filter((i) => !i.sent_at).reduce((sum, i) => sum + i.quantity, 0),
        ready_count: items.filter((i) => i.kitchen_status === "ready").reduce((sum, i) => sum + i.quantity, 0),
    };
};

// Still waiting to reach the server (a CONFLICT is final - it never blocks).
const QUEUED = [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.SYNCING, OUTBOX_STATUS.ERROR];
const hasQueuedTableOps = async () => (await db.outbox.where("entity").equals(ENTITY).filter((e) => QUEUED.includes(e.status)).count()) > 0;

export const usePosTables = ({ pointOfSaleId, enabled = true, me = null, onKitchenReady, onNewRequest }) => {
    const { t } = useI18n();
    const [tables, setTables] = useState([]);
    const [tabs, setTabs] = useState([]);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(false);
    const tabsRef = useRef(tabs);
    tabsRef.current = tabs;
    const requestsRef = useRef(requests);
    requestsRef.current = requests;
    // What was already seen, so only *changes* notify (never the first load).
    const readySeen = useRef(null);
    const requestsSeen = useRef(null);
    const callbacks = useRef({ onKitchenReady, onNewRequest });
    callbacks.current = { onKitchenReady, onNewRequest };
    const meId = me?.id || null;

    const inLocation = useCallback((row) => !pointOfSaleId || String(row.point_of_sale_id) === String(pointOfSaleId), [pointOfSaleId]);

    const notifyChanges = useCallback(
        (nextTabs, nextRequests) => {
            const readyKeys = new Set();
            const fresh = [];
            for (const tab of nextTabs) {
                for (const item of tab.items || []) {
                    if (item.kitchen_status !== "ready") continue;
                    const key = `${tab._id}|${item._id}`;
                    readyKeys.add(key);
                    if (readySeen.current && !readySeen.current.has(key) && (!tab.waiter?.id || tab.waiter.id === meId)) fresh.push(tab);
                }
            }
            if (readySeen.current) [...new Set(fresh)].forEach((tab) => callbacks.current.onKitchenReady?.(tab));
            readySeen.current = readyKeys;

            const ids = new Set(nextRequests.map((r) => r._id));
            if (requestsSeen.current) nextRequests.filter((r) => !requestsSeen.current.has(r._id)).forEach((r) => callbacks.current.onNewRequest?.(r));
            requestsSeen.current = ids;
        },
        [meId]
    );

    const reload = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        const fromMirror = async () => {
            const [localTables, localTabs, localRequests] = await Promise.all([readMirrorAll("diningTables"), readMirrorAll(ENTITY), readMirrorAll(REQUESTS)]);
            setTables(localTables);
            setTabs(localTabs.filter((t) => t.status === "open"));
            setRequests(localRequests.filter((r) => r.status === "pending"));
        };
        try {
            if (getConnectivityState() && !(await hasQueuedTableOps())) {
                const [tablesRes, tabsRes, requestsRes] = await Promise.all([
                    api.get("/restaurant/tables"),
                    api.get("/restaurant/table-tabs/open"),
                    api.get("/restaurant/requests/pending").catch(() => null),
                ]);
                const nextTables = tablesRes.data?.data || [];
                const nextTabs = tabsRes.data?.data || [];
                const nextRequests = requestsRes?.data?.data || requestsRef.current;
                await Promise.all([mirrorReplaceAll("diningTables", nextTables), mirrorReplaceAll(ENTITY, nextTabs), mirrorReplaceAll(REQUESTS, nextRequests)]);
                notifyChanges(nextTabs, nextRequests);
                setTables(nextTables);
                setTabs(nextTabs);
                setRequests(nextRequests);
            } else {
                await fromMirror();
            }
        } catch (error) {
            if (!error.response) await fromMirror();
            else console.error("Error loading tables:", error);
        } finally {
            setLoading(false);
        }
    }, [enabled, notifyChanges]);

    useEffect(() => {
        reload();
    }, [reload]);
    useDataInvalidation(["table", "kitchen"], reload);
    useEffect(() => subscribeSyncCompleted(reload), [reload]);

    const saveTabLocally = useCallback(async (tab) => {
        const next = withTotals(tab);
        await mirrorUpsert(ENTITY, next);
        setTabs((prev) => (prev.some((t) => t._id === next._id) ? prev.map((t) => (t._id === next._id ? next : t)) : [...prev, next]));
        return next;
    }, []);

    const dropTabLocally = useCallback(async (tabId) => {
        await mirrorRemove(ENTITY, tabId);
        setTabs((prev) => prev.filter((t) => t._id !== tabId));
    }, []);

    // Online and nothing queued ahead -> call now; otherwise queue behind the
    // earlier operations. A server rejection reloads the authoritative state.
    // `describe(reason)` turns a rejection into a message that says WHAT
    // failed; one toast id per kind of failure so rapid taps never stack
    // four identical errors.
    const send = useCallback(
        async (request, { describe, toastId = "pos-table-op" } = {}) => {
            if (getConnectivityState() && !(await hasQueuedTableOps())) {
                try {
                    const response = await api.request({ ...request, headers: { "Idempotency-Key": newId() } });
                    return response.data?.data;
                } catch (error) {
                    if (error.response) {
                        const reason = error.response.data?.message || t("tables.save_failed");
                        toast.error(describe ? describe(reason) : reason, { id: toastId });
                        // Server state wins: drops whatever it did not accept.
                        await reload();
                        throw error;
                    }
                }
            }
            await enqueueOperation({ entity: ENTITY, opType: "custom", request });
            return null;
        },
        [reload, t]
    );

    const tabForTable = useCallback((tableId) => tabs.find((t) => t.table_id === tableId && t.status === "open"), [tabs]);

    const openTab = useCallback(
        async (table, { guests } = {}) => {
            const existing = tabForTable(table._id);
            if (existing) return existing;
            const tab = await saveTabLocally({
                _id: newId(),
                table_id: table._id,
                table_name: table.name,
                point_of_sale_id: table.point_of_sale_id,
                status: "open",
                guests: guests || null,
                note: null,
                opened_at: new Date().toISOString(),
                opened_by: me,
                waiter: me,
                items: [],
            });
            try {
                const server = await send({ method: "post", url: "/restaurant/table-tabs", data: { id: tab._id, table_id: table._id, guests: guests || undefined } });
                // Another device opened this table first - use theirs.
                if (server && server._id !== tab._id) {
                    await dropTabLocally(tab._id);
                    return saveTabLocally(server);
                }
            } catch {
                await dropTabLocally(tab._id);
                return null;
            }
            return tab;
        },
        [tabForTable, saveTabLocally, dropTabLocally, send, me]
    );

    const changeQuantity = useCallback(
        async (tabId, { lineId, product, delta, unitPrice }) => {
            const tab = tabsRef.current.find((t) => t._id === tabId);
            if (!tab || !delta) return;
            const items = [...(tab.items || [])];
            const index = items.findIndex((i) => i._id === lineId);
            if (index >= 0) {
                const quantity = items[index].quantity + delta;
                if (quantity <= 0) items.splice(index, 1);
                else items[index] = { ...items[index], quantity };
            } else if (delta > 0) {
                items.push({
                    _id: lineId,
                    product_id: product._id,
                    product_name: product.product_name,
                    quantity: delta,
                    unit_price: unitPrice ?? (Number(product.selling_price) || 0),
                    note: null,
                    sent_at: null,
                    kitchen_status: null,
                    created_by: me,
                    created_at: new Date().toISOString(),
                });
            } else {
                return;
            }
            await saveTabLocally({ ...tab, items });
            await send(
                {
                    method: "post",
                    url: `/restaurant/table-tabs/${tabId}/items`,
                    data: { line_id: lineId, product_id: product?._id, quantity_delta: delta, unit_price: unitPrice },
                },
                {
                    toastId: `pos-table-item-${product?._id}`,
                    describe: (reason) => t("tables.item_rejected", { product: product?.product_name || "", reason }),
                }
            // On rejection send() already reloaded the server's tab, which drops
            // the line the server refused - nothing more to undo here.
            ).catch(() => {});
        },
        [saveTabLocally, send, t, me]
    );

    // Tapping a product adds to its not-yet-sent line (new units after a
    // comanda start a fresh line, so the kitchen only ever sees the new ones).
    const addProduct = useCallback(
        (tabId, product) => {
            const tab = tabsRef.current.find((t) => t._id === tabId);
            const open = tab?.items?.find((i) => i.product_id === product._id && !i.sent_at);
            return changeQuantity(tabId, { lineId: open?._id || newId(), product, delta: 1 });
        },
        [changeQuantity]
    );

    const setLinePrice = useCallback(
        async (tabId, lineId, price) => {
            const tab = tabsRef.current.find((t) => t._id === tabId);
            if (!tab) return;
            await saveTabLocally({ ...tab, items: tab.items.map((i) => (i._id === lineId ? { ...i, unit_price: price } : i)) });
            await send({ method: "patch", url: `/restaurant/table-tabs/${tabId}/items/${lineId}`, data: { unit_price: price } }).catch(() => {});
        },
        [saveTabLocally, send]
    );

    // Kitchen note for one line ("sin cebolla") - printed on the comanda.
    const setLineNote = useCallback(
        async (tabId, lineId, note) => {
            const tab = tabsRef.current.find((x) => x._id === tabId);
            if (!tab) return;
            const clean = String(note || "").trim().slice(0, 120) || null;
            await saveTabLocally({ ...tab, items: tab.items.map((i) => (i._id === lineId ? { ...i, note: clean } : i)) });
            await send({ method: "patch", url: `/restaurant/table-tabs/${tabId}/items/${lineId}`, data: { note: clean } }).catch(() => {});
        },
        [saveTabLocally, send]
    );

    // Returns the lines that go on the kitchen ticket. printed = this device
    // prints the comanda itself, so the print station must skip it.
    const sendToKitchen = useCallback(
        async (tabId, { printed = false } = {}) => {
            const tab = tabsRef.current.find((t) => t._id === tabId);
            if (!tab) return [];
            const pending = tab.items.filter((i) => !i.sent_at);
            if (!pending.length) return [];
            const now = new Date().toISOString();
            await saveTabLocally({ ...tab, items: tab.items.map((i) => (i.sent_at ? i : { ...i, sent_at: now, kitchen_status: "pending" })) });
            await send({ method: "post", url: `/restaurant/table-tabs/${tabId}/send`, data: { printed } }).catch(() => {});
            return pending;
        },
        [saveTabLocally, send]
    );

    // The waiter delivered what the kitchen marked ready.
    const markServed = useCallback(
        async (tabId) => {
            const tab = tabsRef.current.find((t) => t._id === tabId);
            if (!tab) return;
            const lineIds = tab.items.filter((i) => i.kitchen_status === "ready").map((i) => i._id);
            if (!lineIds.length) return;
            const now = new Date().toISOString();
            await saveTabLocally({ ...tab, items: tab.items.map((i) => (lineIds.includes(i._id) ? { ...i, kitchen_status: "served", served_at: now } : i)) });
            await send({ method: "post", url: `/restaurant/table-tabs/${tabId}/kitchen-status`, data: { status: "served", line_ids: lineIds } }).catch(() => {});
        },
        [saveTabLocally, send]
    );

    // "Atender esta mesa": the current user becomes the tab's waiter.
    const takeOver = useCallback(
        async (tabId) => {
            const tab = tabsRef.current.find((t) => t._id === tabId);
            if (!tab || !me) return;
            await saveTabLocally({ ...tab, waiter: me });
            await send({ method: "patch", url: `/restaurant/table-tabs/${tabId}`, data: { take_over: true } }).catch(() => {});
        },
        [saveTabLocally, send, me]
    );

    const moveTab = useCallback(
        async (tabId, table) => {
            const tab = tabsRef.current.find((t) => t._id === tabId);
            if (!tab || tabForTable(table._id)) return false;
            await saveTabLocally({ ...tab, table_id: table._id, table_name: table.name });
            await send({ method: "patch", url: `/restaurant/table-tabs/${tabId}`, data: { table_id: table._id } }).catch(() => {});
            return true;
        },
        [tabForTable, saveTabLocally, send]
    );

    const cancelTab = useCallback(
        async (tabId) => {
            await dropTabLocally(tabId);
            await send({ method: "post", url: `/restaurant/table-tabs/${tabId}/cancel` }).catch(() => {});
        },
        [dropTabLocally, send]
    );

    // After a sale: the server closes the tab in the same POST /orders.
    const closeTabLocally = dropTabLocally;

    // --- Customer requests from the table QR -------------------------------
    const dropRequestLocally = useCallback(async (requestId) => {
        await mirrorRemove(REQUESTS, requestId);
        setRequests((prev) => prev.filter((r) => r._id !== requestId));
    }, []);

    // An accepted QR order lands on the table's tab - opened now if the table
    // is free. Line ids mirror the server's (`<request id>-<index>`), so the
    // optimistic tab and a queued accept replayed later agree on the lines.
    // Returns the tab the order went to.
    const acceptRequest = useCallback(
        async (request, { sendToKitchen: alsoSend = false, printed = false } = {}) => {
            await dropRequestLocally(request._id);
            let tab = null;
            if (request.type === "order") {
                const table = tables.find((x) => x._id === request.table_id);
                const existing = tabsRef.current.find((x) => x.table_id === request.table_id && x.status === "open");
                const now = new Date().toISOString();
                const lines = (request.items || []).map((item, index) => ({
                    _id: `${request._id}-${index}`,
                    product_id: item.product_id,
                    product_name: item.product_name,
                    quantity: item.quantity,
                    unit_price: Number(item.unit_price) || 0,
                    note: item.note || null,
                    sent_at: alsoSend ? now : null,
                    kitchen_status: alsoSend ? "pending" : null,
                    created_by: me,
                    created_at: now,
                }));
                const base = existing || {
                    _id: newId(),
                    table_id: request.table_id,
                    table_name: table?.name || request.table_name,
                    point_of_sale_id: request.point_of_sale_id,
                    status: "open",
                    guests: null,
                    note: null,
                    opened_at: now,
                    opened_by: me,
                    waiter: me,
                    items: [],
                };
                const known = new Set((base.items || []).map((i) => i._id));
                tab = await saveTabLocally({ ...base, items: [...(base.items || []), ...lines.filter((l) => !known.has(l._id))] });
            }
            await send(
                { method: "post", url: `/restaurant/requests/${request._id}/accept`, data: { tab_id: tab?._id, send_to_kitchen: alsoSend, printed: alsoSend && printed } },
                { toastId: "pos-table-request" }
            ).catch(() => {});
            return tab;
        },
        [tables, dropRequestLocally, saveTabLocally, send, me]
    );

    const rejectRequest = useCallback(
        async (request) => {
            await dropRequestLocally(request._id);
            await send({ method: "post", url: `/restaurant/requests/${request._id}/reject` }, { toastId: "pos-table-request" }).catch(() => {});
        },
        [dropRequestLocally, send]
    );

    const createTables = useCallback(
        async (rows) => {
            const response = await api.post("/restaurant/tables", { tables: rows, ...(pointOfSaleId ? { pointOfSaleId } : {}) });
            await reload();
            return response.data?.data;
        },
        [pointOfSaleId, reload]
    );

    const updateTable = useCallback(
        async (tableId, patch) => {
            await api.patch(`/restaurant/tables/${tableId}`, patch);
            await reload();
        },
        [reload]
    );

    const locationTables = useMemo(() => tables.filter((t) => t.is_active !== false && inLocation(t)), [tables, inLocation]);
    const locationTabs = useMemo(() => tabs.filter((t) => t.status === "open" && inLocation(t)).map(withTotals), [tabs, inLocation]);
    const locationRequests = useMemo(() => requests.filter((r) => r.status === "pending" && inLocation(r)), [requests, inLocation]);

    return {
        tables: locationTables,
        tabs: locationTabs,
        requests: locationRequests,
        loading,
        reload,
        tabForTable,
        openTab,
        addProduct,
        changeQuantity,
        setLinePrice,
        setLineNote,
        sendToKitchen,
        markServed,
        takeOver,
        moveTab,
        cancelTab,
        closeTabLocally,
        acceptRequest,
        rejectRequest,
        createTables,
        updateTable,
    };
};
