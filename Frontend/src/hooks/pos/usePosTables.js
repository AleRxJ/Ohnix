import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import { db } from "../../offline/db";
import { getConnectivityState } from "../../offline/connectivity";
import { enqueueOperation, OUTBOX_STATUS } from "../../offline/outbox";
import { mirrorRemove, mirrorReplaceAll, mirrorUpsert, readMirrorAll } from "../../offline/entityQueue";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { useDataInvalidation } from "../useDataInvalidation";

// Restaurant mode of the Caja: the location's tables and their open tabs.
// Every change is applied locally first (state + Dexie mirror), then sent
// straight to the API when online - or queued in the outbox when offline, or
// when earlier table operations are still queued (so a tab opened offline
// always reaches the server before the items added to it). Tab and line ids
// are generated here, which is what makes queued writes safe to replay.

const ENTITY = "tableTabs";
const newId = () => crypto.randomUUID();

const withTotals = (tab) => {
    const items = tab.items || [];
    return {
        ...tab,
        subtotal: items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0),
        unsent_count: items.filter((i) => !i.sent_at).reduce((sum, i) => sum + i.quantity, 0),
    };
};

// Still waiting to reach the server (a CONFLICT is final - it never blocks).
const QUEUED = [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.SYNCING, OUTBOX_STATUS.ERROR];
const hasQueuedTableOps = async () => (await db.outbox.where("entity").equals(ENTITY).filter((e) => QUEUED.includes(e.status)).count()) > 0;

export const usePosTables = ({ pointOfSaleId, enabled = true }) => {
    const [tables, setTables] = useState([]);
    const [tabs, setTabs] = useState([]);
    const [loading, setLoading] = useState(false);
    const tabsRef = useRef(tabs);
    tabsRef.current = tabs;

    const inLocation = useCallback((row) => !pointOfSaleId || String(row.point_of_sale_id) === String(pointOfSaleId), [pointOfSaleId]);

    const reload = useCallback(async () => {
        if (!enabled) return;
        setLoading(true);
        try {
            if (getConnectivityState() && !(await hasQueuedTableOps())) {
                const [tablesRes, tabsRes] = await Promise.all([api.get("/restaurant/tables"), api.get("/restaurant/table-tabs/open")]);
                const nextTables = tablesRes.data?.data || [];
                const nextTabs = tabsRes.data?.data || [];
                await Promise.all([mirrorReplaceAll("diningTables", nextTables), mirrorReplaceAll(ENTITY, nextTabs)]);
                setTables(nextTables);
                setTabs(nextTabs);
            } else {
                const [localTables, localTabs] = await Promise.all([readMirrorAll("diningTables"), readMirrorAll(ENTITY)]);
                setTables(localTables);
                setTabs(localTabs.filter((t) => t.status === "open"));
            }
        } catch (error) {
            if (!error.response) {
                const [localTables, localTabs] = await Promise.all([readMirrorAll("diningTables"), readMirrorAll(ENTITY)]);
                setTables(localTables);
                setTabs(localTabs.filter((t) => t.status === "open"));
            } else {
                console.error("Error loading tables:", error);
            }
        } finally {
            setLoading(false);
        }
    }, [enabled]);

    useEffect(() => {
        reload();
    }, [reload]);
    useDataInvalidation(["table"], reload);
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
    const send = useCallback(
        async (request) => {
            if (getConnectivityState() && !(await hasQueuedTableOps())) {
                try {
                    const response = await api.request({ ...request, headers: { "Idempotency-Key": newId() } });
                    return response.data?.data;
                } catch (error) {
                    if (error.response) {
                        toast.error(error.response.data?.message || "No se pudo guardar el cambio de la mesa.");
                        await reload();
                        throw error;
                    }
                }
            }
            await enqueueOperation({ entity: ENTITY, opType: "custom", request });
            return null;
        },
        [reload]
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
        [tabForTable, saveTabLocally, dropTabLocally, send]
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
                    created_at: new Date().toISOString(),
                });
            } else {
                return;
            }
            await saveTabLocally({ ...tab, items });
            await send({
                method: "post",
                url: `/restaurant/table-tabs/${tabId}/items`,
                data: { line_id: lineId, product_id: product?._id, quantity_delta: delta, unit_price: unitPrice },
            }).catch(() => {});
        },
        [saveTabLocally, send]
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

    // Returns the lines that go on the kitchen ticket.
    const sendToKitchen = useCallback(
        async (tabId) => {
            const tab = tabsRef.current.find((t) => t._id === tabId);
            if (!tab) return [];
            const pending = tab.items.filter((i) => !i.sent_at);
            if (!pending.length) return [];
            const now = new Date().toISOString();
            await saveTabLocally({ ...tab, items: tab.items.map((i) => (i.sent_at ? i : { ...i, sent_at: now })) });
            await send({ method: "post", url: `/restaurant/table-tabs/${tabId}/send` }).catch(() => {});
            return pending;
        },
        [saveTabLocally, send]
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

    return {
        tables: locationTables,
        tabs: locationTabs,
        loading,
        reload,
        tabForTable,
        openTab,
        addProduct,
        changeQuantity,
        setLinePrice,
        sendToKitchen,
        moveTab,
        cancelTab,
        closeTabLocally,
        createTables,
        updateTable,
    };
};
