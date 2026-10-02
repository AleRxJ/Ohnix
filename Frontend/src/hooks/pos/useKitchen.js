import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "react-hot-toast";
import { api } from "../../api/api";
import { db } from "../../offline/db";
import { getConnectivityState } from "../../offline/connectivity";
import { enqueueOperation, OUTBOX_STATUS } from "../../offline/outbox";
import { mirrorReplaceAll, mirrorUpsert, mirrorRemove, readMirrorAll } from "../../offline/entityQueue";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { useDataInvalidation } from "../useDataInvalidation";
import useI18n from "../useI18n";
import { printKitchenTicket } from "../../utils/posReceipt";

// Kitchen display (KitchenDisplay.jsx): every round ("Enviar a cocina") of
// the location's open tabs the kitchen hasn't finished. Same offline model
// as usePosTables - status changes apply locally first and are queued when
// there's no connection (they're absolute, so a replay is harmless).

const ENTITY = "kitchenRounds";
const STATUSES = ["pending", "preparing", "ready", "served"];
const QUEUED = [OUTBOX_STATUS.PENDING, OUTBOX_STATUS.SYNCING, OUTBOX_STATUS.ERROR];
const hasQueued = async () => (await db.outbox.where("entity").equals(ENTITY).filter((e) => QUEUED.includes(e.status)).count()) > 0;

export const useKitchen = ({ pointOfSaleId, enabled = true, onNewRound }) => {
    const { t } = useI18n();
    const [rounds, setRounds] = useState([]);
    const [loading, setLoading] = useState(true);
    const seen = useRef(null);
    const onNewRoundRef = useRef(onNewRound);
    onNewRoundRef.current = onNewRound;
    const roundsRef = useRef(rounds);
    roundsRef.current = rounds;

    const reload = useCallback(async () => {
        if (!enabled) return;
        try {
            let next;
            if (getConnectivityState() && !(await hasQueued())) {
                const response = await api.get("/restaurant/kitchen", { params: pointOfSaleId ? { pointOfSaleId } : {} });
                next = response.data?.data || [];
                await mirrorReplaceAll(ENTITY, next);
            } else {
                next = await readMirrorAll(ENTITY);
            }
            const keys = new Set(next.map((r) => r._id));
            if (seen.current) {
                const fresh = next.filter((r) => !seen.current.has(r._id) && r.status === "pending");
                if (fresh.length) onNewRoundRef.current?.(fresh);
            }
            seen.current = keys;
            setRounds(next);
        } catch (error) {
            if (!error.response) setRounds(await readMirrorAll(ENTITY));
            else console.error("Error loading kitchen:", error);
        } finally {
            setLoading(false);
        }
    }, [enabled, pointOfSaleId]);

    useEffect(() => {
        seen.current = null;
        reload();
    }, [reload]);
    useDataInvalidation(["kitchen", "table"], reload);
    useEffect(() => subscribeSyncCompleted(reload), [reload]);
    // Socket events are the primary signal; this only covers a socket that
    // silently dropped (tablet asleep, flaky kitchen Wi-Fi).
    useEffect(() => {
        const id = setInterval(() => {
            if (getConnectivityState()) reload();
        }, 45000);
        return () => clearInterval(id);
    }, [reload]);

    const setStatus = useCallback(
        async (round, status) => {
            if (!STATUSES.includes(status)) return;
            const next = { ...round, status, items: round.items.map((i) => ({ ...i, kitchen_status: status })), ready_at: status === "ready" ? new Date().toISOString() : round.ready_at };
            if (status === "served") {
                await mirrorRemove(ENTITY, round._id);
                setRounds((prev) => prev.filter((r) => r._id !== round._id));
            } else {
                await mirrorUpsert(ENTITY, next);
                setRounds((prev) => prev.map((r) => (r._id === round._id ? next : r)));
            }
            const request = { method: "post", url: `/restaurant/table-tabs/${round.tab_id}/kitchen-status`, data: { status, sent_at: round.sent_at } };
            if (getConnectivityState() && !(await hasQueued())) {
                try {
                    await api.request(request);
                    return;
                } catch (error) {
                    if (error.response) {
                        toast.error(error.response.data?.message || t("tables.save_failed"), { id: "kitchen-status" });
                        await reload();
                        return;
                    }
                }
            }
            await enqueueOperation({ entity: ENTITY, opType: "custom", request });
        },
        [reload, t]
    );

    const byStatus = useMemo(() => {
        const groups = { pending: [], preparing: [], ready: [] };
        rounds.forEach((r) => groups[r.status]?.push(r));
        return groups;
    }, [rounds]);

    return { rounds, byStatus, loading, reload, setStatus };
};

// Auto-print station: when this device is the location's comanda printer,
// every new round is claimed on the server (exactly one station wins each
// line - tableTab.service.js#claimKitchenPrint) and printed here. Online
// only: claiming needs the server, and an offline waiter's sends only reach
// the kitchen once they sync anyway.
export const useKitchenPrintStation = ({ pointOfSaleId, enabled, width, companyName }) => {
    const { t } = useI18n();
    const busy = useRef(false);
    const again = useRef(false);

    const claimAndPrint = useCallback(async () => {
        if (!enabled || !getConnectivityState()) return;
        if (busy.current) {
            again.current = true;
            return;
        }
        busy.current = true;
        try {
            do {
                again.current = false;
                const response = await api.post("/restaurant/kitchen/claim-print", pointOfSaleId ? { pointOfSaleId } : {});
                const claimed = response.data?.data || [];
                for (const round of claimed) {
                    await printKitchenTicket({
                        companyName,
                        tableName: round.table_name,
                        zone: round.zone,
                        guests: round.guests,
                        waiter: round.waiter?.name,
                        items: round.items,
                        round: round.round,
                        tabCode: String(round.tab_id).replace(/-/g, "").slice(-5).toUpperCase(),
                        width,
                        t,
                    });
                }
            } while (again.current);
        } catch (error) {
            console.error("Kitchen print station failed:", error);
        } finally {
            busy.current = false;
        }
    }, [enabled, pointOfSaleId, width, companyName, t]);

    useEffect(() => {
        claimAndPrint();
    }, [claimAndPrint]);
    useDataInvalidation(["kitchen"], claimAndPrint);
    useEffect(() => subscribeSyncCompleted(claimAndPrint), [claimAndPrint]);
};
