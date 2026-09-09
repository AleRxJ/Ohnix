import React, { useCallback, useEffect, useRef, useState } from "react";
import { Typography, Spin, Button, Popconfirm, Steps, Tooltip } from "antd";
import {
    SwapOutlined,
    SendOutlined,
    CheckOutlined,
    CarOutlined,
    InboxOutlined,
    CloseOutlined,
    ShopOutlined,
    HomeOutlined,
    ClusterOutlined,
    ArrowRightOutlined,
    ExclamationCircleOutlined,
    ThunderboltOutlined,
    EyeOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import useSubscription from "../../hooks/useSubscription";
import useCountUp from "../../hooks/useCountUp";
import { useDataInvalidation } from "../../hooks/useDataInvalidation";
import { api } from "../../api/api";
import { pointOfSaleService } from "../../services/pointOfSaleService";
import { stockTransferService } from "../../services/stockTransferService";
import TransferStockModal from "./TransferStockModal";
import RequestTransferModal from "./RequestTransferModal";
import ReceiveTransferModal from "./ReceiveTransferModal";
import TransferDetailModal from "./TransferDetailModal";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { queueCreate, queueUpdate, readMirrorAll, mirrorUpsert, mirrorUpsertMany, mirrorReplaceAll } from "../../offline/entityQueue";
import { enqueueOperation } from "../../offline/outbox";

const { Text } = Typography;

// Same palette used for the pill+dot pattern ElectronicInvoices.jsx
// established (STATUS_COLORS/StatusPill, index.css's .status-pill), but
// re-declared locally with real hex values instead of `var(--...)`: that
// file's version concatenates the color with an alpha suffix
// (`${color}18`), which only produces valid CSS when color is a hex
// literal - passing it a CSS custom property string breaks the alpha trick
// silently. Not fixing that file (out of scope here), just not repeating it.
const TRANSFER_STATUS_COLORS = {
    requested: "#8b98a0",
    approved: "#7c6af7",
    in_transit: "#f59e0b",
    received: "#44f3f0",
    cancelled: "#fb7185",
};

const STATUS_KEY = {
    requested: "transfer_status_requested",
    approved: "transfer_status_approved",
    in_transit: "transfer_status_in_transit",
    received: "transfer_status_received",
    cancelled: "transfer_status_cancelled",
};

const STEP_ORDER = ["requested", "approved", "in_transit", "received"];

// Maps a transfer action to how it's queued offline - the URL/method/body
// shape it replays with, and the optimistic status-only patch (never a
// stock/costing guess - see LocationStockPanel's handleQuickTransfer
// comment) shown until it actually syncs.
const TRANSFER_ACTION_REQUEST = {
    approve: (id) => ({ method: "patch", url: `/stock-transfers/${id}/approve`, data: {}, status: "approved" }),
    ship: (id) => ({ method: "patch", url: `/stock-transfers/${id}/ship`, data: {}, status: "in_transit" }),
    receive: (id, extra) => ({
        method: "patch",
        url: `/stock-transfers/${id}/receive`,
        data: { quantity_received: extra.quantityReceived, notes: extra.notes },
        status: "received",
    }),
    cancel: (id, extra) => ({
        method: "patch",
        url: `/stock-transfers/${id}/cancel`,
        data: { reason: extra?.reason },
        status: "cancelled",
    }),
};

// Where the visual stepper's "current" pointer sits for a transfer. Reusing
// the *At timestamps (set at each transition, see stockTransfer.service.js)
// instead of trusting status alone: a cancelled transfer keeps its status
// as "cancelled" forever, but the timestamps still say how far it got
// before that happened, which is what the frozen stepper should show. A
// received transfer intentionally returns one past the last index so every
// step renders as finished (checkmarks) rather than the last one looking
// "still in progress".
const stepIndexForTransfer = (tr) => {
    if (tr.status === "received") return STEP_ORDER.length;
    if (tr.sent_at) return 2;
    if (tr.approved_at) return 1;
    return 0;
};

const LOCATION_TYPE_ICON = {
    point_of_sale: ShopOutlined,
    warehouse: HomeOutlined,
    distribution_center: ClusterOutlined,
};

const TransferStatusPill = ({ status, t }) => {
    const color = TRANSFER_STATUS_COLORS[status] || TRANSFER_STATUS_COLORS.requested;
    return (
        <span
            className="status-pill"
            style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}
        >
            <span className="status-dot" style={{ background: color }} />
            {t(`products.${STATUS_KEY[status] || STATUS_KEY.requested}`)}
        </span>
    );
};

const AnimatedStat = ({ value, className }) => {
    const animated = useCountUp(value ?? 0, 700);
    return <span className={`tabular-nums ${className || ""}`}>{animated}</span>;
};

const formatTransferDate = (value, language) =>
    new Date(value).toLocaleString(language, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });

// Per-location breakdown (available / in transit / total, matching the
// 2026-08-21 multi-location inventory spec's example table) plus the
// transfer workflow for this one product - both live here rather than in
// ProductDetailsDrawer directly, same one-component-per-concern split as
// AdjustStockModal/TransferStockModal. Renders nothing for accounts with
// only one location: with a single point of sale there's nothing to break
// down or move between.
const LocationStockPanel = ({ product }) => {
    const { t, currentLanguage } = useI18n();
    const { can } = useSubscription();
    const [pointsOfSale, setPointsOfSale] = useState([]);
    const [summary, setSummary] = useState(null);
    const [transfers, setTransfers] = useState([]);
    const [detailFor, setDetailFor] = useState(null);
    // Tracked separately from pointsOfSale/loading on purpose: a failed
    // fetch used to leave pointsOfSale at its initial empty array, which
    // the render check below read as "this account only has one location"
    // and hid the whole panel the moment `loading` flipped to false - a
    // transient network/DB hiccup (Promise.all fires 3 concurrent requests,
    // and this account's earlier StockTransfer testing already surfaced a
    // real transient PgBouncer error under concurrent load) made the panel
    // flash and disappear instead of showing an error. Only "loaded" is
    // allowed to hide the panel for genuinely having <= 1 location; "error"
    // keeps whatever was last shown (or a retry prompt on the very first
    // load) instead of silently vanishing.
    const [status, setStatus] = useState("loading");
    const [quickOpen, setQuickOpen] = useState(false);
    const [requestOpen, setRequestOpen] = useState(false);
    const [receiveFor, setReceiveFor] = useState(null);
    const [actionLoading, setActionLoading] = useState(false);
    // Which location cards to rim in accent light for one animation cycle
    // (see .location-card--updated in index.css) because a LIVE event (or
    // this tab's own action) just changed their totals - purely cosmetic,
    // computed by diffing this load's totals against the previous one.
    const [justUpdated, setJustUpdated] = useState(() => new Set());
    const prevTotalsRef = useRef(null);

    const loadAll = useCallback(async () => {
        if (!product?._id) return;
        if (!getConnectivityState()) {
            const [cachedPos, cachedSummary, cachedTransfers] = await Promise.all([
                readMirrorAll("pointsOfSale"),
                readMirrorAll("locationStockSummaries"),
                readMirrorAll("stockTransfers"),
            ]);
            setPointsOfSale(cachedPos.filter((pos) => pos.isActive));
            const summaryRow = cachedSummary.find((row) => row._id === product._id);
            setSummary(summaryRow?.summary || null);
            setTransfers(cachedTransfers.filter((tr) => tr.product_id?._id === product._id || tr.product_id === product._id));
            setStatus("loaded");
            return;
        }
        setStatus((prev) => (prev === "loaded" ? prev : "loading"));
        try {
            const [posRes, stockRes, transfersRes] = await Promise.all([
                pointOfSaleService.list(),
                api.get(`/products/${product._id}/location-stock`),
                stockTransferService.list({ productId: product._id }),
            ]);
            setPointsOfSale((posRes?.data || []).filter((pos) => pos.isActive));
            const nextSummary = stockRes?.data?.data || null;
            setSummary(nextSummary);
            setTransfers(transfersRes?.data || []);
            setStatus("loaded");
            // Write-through - pointsOfSale is the full account list (safe to
            // replace wholesale); the summary is this one product's own row
            // (upsert, keyed by product id); transfers merge into whatever's
            // already cached from other products' visits (see db.js).
            mirrorReplaceAll("pointsOfSale", posRes?.data || []);
            mirrorUpsert("locationStockSummaries", { _id: product._id, summary: nextSummary });
            mirrorUpsertMany("stockTransfers", transfersRes?.data || []);

            const prevTotals = prevTotalsRef.current;
            const nextTotals = new Map(
                (nextSummary?.locations || []).map((row) => [row.point_of_sale_id, row.total])
            );
            if (prevTotals) {
                const changed = new Set();
                nextTotals.forEach((total, id) => {
                    if (prevTotals.get(id) !== total) changed.add(id);
                });
                if (changed.size > 0) {
                    setJustUpdated(changed);
                    setTimeout(() => setJustUpdated(new Set()), 1100);
                }
            }
            prevTotalsRef.current = nextTotals;
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
            setStatus("error");
        }
    }, [product?._id, t]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    // Someone else (another tab, another team member) moving this same
    // product between locations is exactly what this panel exists to show -
    // see Backend/services/stockTransfer.service.js's emitPosEvent calls on
    // every transition, and productLocationStock changes via "product".
    useDataInvalidation(["stockTransfer", "product"], loadAll);

    // Refetch once a full sync cycle completes (not merely "connectivity
    // came back") - see useOrders.js for why the raw connectivity event
    // alone races the outbox drain.
    useEffect(() => subscribeSyncCompleted(loadAll), [loadAll]);

    // payload is already shaped for the API (from_point_of_sale_id,
    // to_point_of_sale_id, quantity, reason) - see TransferStockModal's
    // own onSubmit call.
    const handleQuickTransfer = async (productId, payload) => {
        setActionLoading(true);
        if (!getConnectivityState()) {
            // Action-only - a quick transfer claims AND credits stock in one
            // step server-side (see stockTransfer.service.js#quickTransfer),
            // so no optimistic effect is attempted here (same "never guess
            // at inventory outcomes" reasoning as the rest of Etapa 4). The
            // resulting transfer/stock figures only show up once this
            // actually syncs.
            await enqueueOperation({
                entity: "stockTransfers",
                opType: "custom",
                request: { method: "post", url: `/products/${productId}/transfer-stock`, data: payload },
            });
            toast.success(t("common.offline_saved_locally"));
            setQuickOpen(false);
            setActionLoading(false);
            return;
        }
        try {
            await api.post(`/products/${productId}/transfer-stock`, payload);
            toast.success(t("products.transfer_success"));
            setQuickOpen(false);
            loadAll();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("products.failed_transfer_stock"));
        } finally {
            setActionLoading(false);
        }
    };

    const handleRequest = async (productId, payload) => {
        setActionLoading(true);
        if (!getConnectivityState()) {
            // Safe to create optimistically, unlike quick transfer/ship/
            // receive - requesting a transfer doesn't touch stock at all
            // (see stockTransfer.service.js#requestTransfer), it only
            // exists once approved and shipped.
            const fromPos = pointsOfSale.find((pos) => pos.id === payload.fromPointOfSaleId);
            const toPos = pointsOfSale.find((pos) => pos.id === payload.toPointOfSaleId);
            await queueCreate({
                entity: "stockTransfers",
                url: "/stock-transfers",
                fields: {
                    product_id: productId,
                    from_point_of_sale_id: payload.fromPointOfSaleId,
                    to_point_of_sale_id: payload.toPointOfSaleId,
                    quantity: payload.quantity,
                    notes: payload.notes,
                },
                optimisticExtra: {
                    product_id: productId,
                    from_point_of_sale: fromPos ? { _id: fromPos.id, name: fromPos.name } : { _id: payload.fromPointOfSaleId },
                    to_point_of_sale: toPos ? { _id: toPos.id, name: toPos.name } : { _id: payload.toPointOfSaleId },
                    quantity_sent: payload.quantity,
                    quantity_received: null,
                    status: "requested",
                    requested_at: new Date().toISOString(),
                },
            });
            toast.success(t("common.offline_saved_locally"));
            setRequestOpen(false);
            setActionLoading(false);
            await loadAll();
            return;
        }
        try {
            await stockTransferService.request({ productId, ...payload });
            toast.success(t("products.transfer_requested"));
            setRequestOpen(false);
            loadAll();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("products.failed_request_transfer"));
        } finally {
            setActionLoading(false);
        }
    };

    const runTransferAction = async (kind, action, transferId, successKey, extra) => {
        setActionLoading(true);
        if (!getConnectivityState()) {
            const { status: optimisticStatus, ...request } = TRANSFER_ACTION_REQUEST[kind](transferId, extra);
            await queueUpdate({
                entity: "stockTransfers",
                url: request.url,
                id: transferId,
                fields: request.data,
                optimisticPatch: { status: optimisticStatus },
                method: request.method,
            });
            toast.success(t("common.offline_saved_locally"));
            setActionLoading(false);
            await loadAll();
            return;
        }
        try {
            await action(transferId, extra);
            toast.success(t(successKey));
            loadAll();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("products.failed_update_transfer"));
        } finally {
            setActionLoading(false);
        }
    };

    const handleReceive = async (transferId, payload) => {
        await runTransferAction(
            "receive",
            (id, p) => stockTransferService.receive(id, p),
            transferId,
            "products.transfer_received",
            payload
        );
        setReceiveFor(null);
    };

    // pointsOfSale (from GET /points-of-sale) is every active location the
    // account has, regardless of the caller's own scope - see
    // pointOfSale.controller.js's 2026-08-21 revision. summary.locations
    // (from getLocationStockSummary) is the scope-filtered subset the
    // caller can actually see stock for. The two are used for different
    // things below: the account-wide list is what makes "solicitar
    // traslado" possible even for a single-location member (they can name
    // a source they can't manage), while the scoped list is what "traslado
    // rápido" and "request's destination" are limited to, since both of
    // those require the actor to actually have that location in scope.
    const visiblePointsOfSale = (summary?.locations || []).map((row) => ({
        id: row.point_of_sale_id,
        name: row.point_of_sale_name,
    }));

    // "Solicitar traslado" asks someone ELSE to send stock - a location
    // already in the requester's own scope isn't a valid source, they'd use
    // "Traslado rápido" for that instead (see TransferStockModal, which
    // requires both ends in scope). inOwnScope comes straight from the
    // backend's hasPosAccess check (pointOfSale.controller.js), not
    // re-derived here. For a full-scope actor (owner/admin/posScopeAll)
    // every location is "in their own scope" by definition, so filtering
    // them out would leave zero options - that's the one case where the
    // exclusion doesn't apply and the full list is shown instead.
    const hasFullOwnScope = pointsOfSale.length > 0 && pointsOfSale.every((pos) => pos.inOwnScope);
    const requestFromOptions = hasFullOwnScope ? pointsOfSale : pointsOfSale.filter((pos) => !pos.inOwnScope);

    // Which of this transfer's two ends the CURRENT viewer actually has -
    // approve/ship only make sense (and only succeed server-side, see
    // stockTransfer.controller.js's assertSourceAccess/assertDestinationAccess)
    // for someone with access to that specific end, not just "any
    // authenticated team member". Without this, a destination-only viewer
    // (the common case for "solicitar traslado") saw an "Aprobar" button
    // that could only ever 403 - confusing at best, and actionable only for
    // someone who happens to also have the source in scope, which reads as
    // "the requester approved their own request" even though the real rule
    // is about scope, not identity.
    const ownScopeIds = new Set(pointsOfSale.filter((pos) => pos.inOwnScope).map((pos) => pos.id));
    const hasSourceAccess = (tr) => ownScopeIds.has(tr.from_point_of_sale?._id);
    const hasDestinationAccess = (tr) => ownScopeIds.has(tr.to_point_of_sale?._id);

    if (!can("multiLocation")) return null;
    // Only hide for genuinely having one location once a load has actually
    // succeeded and confirmed it - see the `status` state's comment above
    // for why this can't just be "!loading".
    if (status === "loaded" && pointsOfSale.length <= 1) return null;

    const locations = summary?.locations || [];
    const grandTotal = summary?.totals?.total || 0;

    return (
        <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)] flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#29D8D5]/20 to-[#44F3F0]/5 border border-[var(--ohnix-line-4)]">
                        <SwapOutlined className="text-[#44F3F0]" />
                    </div>
                    <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">
                        {t("products.location_stock_title")}
                    </Text>
                    {status === "loaded" && (
                        <span className="status-pill" style={{ color: "#44f3f0", background: "#44f3f018", border: "1px solid #44f3f033" }}>
                            <span className="status-dot" style={{ background: "#44f3f0" }} />
                            {t("products.live_badge")}
                        </span>
                    )}
                </div>
                <div className="flex gap-2">
                    <Button
                        size="small"
                        icon={<SendOutlined />}
                        onClick={() => setRequestOpen(true)}
                        className="h-8 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                    >
                        {t("products.request_transfer")}
                    </Button>
                    {/* Quick transfer needs both ends in scope (symmetric
                        rule, see stockTransfer.controller.js) - with 0 or 1
                        visible locations there's no valid from/to pair the
                        actor could actually submit, so the button would only
                        ever lead to a 403. "Solicitar traslado" stays
                        available either way: it only needs the destination. */}
                    {visiblePointsOfSale.length > 1 && (
                        <Button
                            size="small"
                            icon={<ThunderboltOutlined />}
                            onClick={() => setQuickOpen(true)}
                            className="h-8 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                        >
                            {t("products.transfer_stock")}
                        </Button>
                    )}
                </div>
            </div>

            <div className="p-5">
                {status === "loading" ? (
                    <div className="flex justify-center py-6">
                        <Spin size="small" />
                    </div>
                ) : status === "error" ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                        <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.failed_load_location_stock")}</Text>
                        <Button size="small" onClick={loadAll}>
                            {t("products.retry_load")}
                        </Button>
                    </div>
                ) : (
                    <>
                        <Text className="text-xs text-[var(--ohnix-text-dim)] block mb-4">{t("products.location_stock_hint")}</Text>

                        {/* Hero: the consolidated total, the one number that
                            matters across every location at a glance -
                            distinct from the per-location cards below so it
                            never gets lost in the grid. */}
                        <div className="animate-fade-up mb-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] bg-gradient-to-br from-[#29D8D5]/10 to-transparent px-5 py-4 flex items-center justify-between flex-wrap gap-4">
                            <div>
                                <Text className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] block">
                                    {t("products.location_grand_total")}
                                </Text>
                                <AnimatedStat value={grandTotal} className="text-3xl font-bold text-[#44F3F0]" />
                            </div>
                            <div className="flex gap-6">
                                <div className="text-right">
                                    <Text className="text-[11px] text-[var(--ohnix-text-dim)] block">{t("products.location_available")}</Text>
                                    <AnimatedStat value={summary?.totals?.available} className="text-lg font-semibold text-[var(--ohnix-text-primary)]" />
                                </div>
                                <div className="text-right">
                                    <Text className="text-[11px] text-[var(--ohnix-text-dim)] block">{t("products.location_in_transit")}</Text>
                                    <AnimatedStat value={summary?.totals?.inTransit} className="text-lg font-semibold text-[var(--ohnix-text-primary)]" />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {locations.map((row, idx) => {
                                const Icon = LOCATION_TYPE_ICON[row.location_type] || ShopOutlined;
                                const pct = grandTotal > 0 ? Math.round((row.total / grandTotal) * 100) : 0;
                                const isUpdated = justUpdated.has(row.point_of_sale_id);
                                return (
                                    <div
                                        key={row.point_of_sale_id}
                                        className={`hover-lift animate-fade-up stagger-${Math.min(idx + 1, 4)} rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-3 ${isUpdated ? "location-card--updated" : ""}`}
                                    >
                                        <div className="flex items-center justify-between gap-2 mb-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                                <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] flex-shrink-0">
                                                    <Icon className="text-[#44F3F0] text-xs" />
                                                </div>
                                                <Tooltip title={row.point_of_sale_name}>
                                                    <Text className="text-sm font-semibold text-[var(--ohnix-text-primary)] truncate">
                                                        {row.point_of_sale_name}
                                                    </Text>
                                                </Tooltip>
                                            </div>
                                            {row.is_default && (
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#44F3F0] bg-[#44f3f018] border border-[#44f3f033] rounded-full px-2 py-0.5 flex-shrink-0">
                                                    {t("pointOfSale.default_badge")}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-end justify-between mb-2">
                                            <div>
                                                <AnimatedStat value={row.available} className="text-xl font-bold text-[var(--ohnix-text-primary)]" />
                                                <Text className="text-[11px] text-[var(--ohnix-text-dim)] block">{t("products.location_available")}</Text>
                                            </div>
                                            {row.in_transit > 0 && (
                                                <Text className="text-xs font-medium text-[var(--ohnix-status-amber)]">
                                                    +{row.in_transit} {t("products.location_in_transit").toLowerCase()}
                                                </Text>
                                            )}
                                        </div>

                                        <div className="location-stock-bar-track">
                                            <div className="location-stock-bar-fill" style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-5 pt-4 border-t border-[var(--ohnix-line-3)]">
                            <Text className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] block mb-3">
                                {t("products.pending_transfers_title")}
                            </Text>
                            {transfers.length === 0 ? (
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.no_pending_transfers")}</Text>
                            ) : (
                                <div className="space-y-3">
                                    {transfers.map((tr, idx) => {
                                        const cancelled = tr.status === "cancelled";
                                        return (
                                            <div
                                                key={tr._id}
                                                className={`animate-fade-up stagger-${Math.min(idx + 1, 4)} rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-3`}
                                            >
                                                <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="px-2 py-0.5 rounded-md bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] text-sm font-medium">
                                                            {tr.from_point_of_sale?.name || "—"}
                                                        </span>
                                                        <ArrowRightOutlined className="text-[var(--ohnix-text-dim)]" />
                                                        <span className="px-2 py-0.5 rounded-md bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] text-sm font-medium">
                                                            {tr.to_point_of_sale?.name || "—"}
                                                        </span>
                                                        <span className="text-sm font-bold text-[#44F3F0] ml-1">
                                                            {tr.quantity_sent}
                                                        </span>
                                                        {tr.is_quick_transfer && (
                                                            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] rounded-full px-2 py-0.5 flex items-center gap-1">
                                                                <ThunderboltOutlined /> {t("products.quick_transfer_badge")}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 flex-shrink-0">
                                                        <TransferStatusPill status={tr.status} t={t} />
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<EyeOutlined />}
                                                            onClick={() => setDetailFor(tr)}
                                                            className="text-[var(--ohnix-text-dim)] hover:text-[#44F3F0]"
                                                        />
                                                    </div>
                                                </div>

                                                <Text className="text-xs text-[var(--ohnix-text-dim)] block mb-2">
                                                    {t("products.transfer_requested_by_on", {
                                                        name: tr.requested_by?.username || "—",
                                                        date: formatTransferDate(tr.requested_at, currentLanguage),
                                                    })}
                                                </Text>

                                                {tr.discrepancy > 0 && (
                                                    <Text className="text-xs text-[var(--ohnix-status-rose)] flex items-center gap-1 mb-2">
                                                        <ExclamationCircleOutlined />
                                                        {t("products.transfer_discrepancy_label")}: {tr.discrepancy}
                                                    </Text>
                                                )}
                                                {cancelled && tr.cancel_reason && (
                                                    <Text className="text-xs text-[var(--ohnix-text-muted)] block mb-2">
                                                        {t("products.transfer_cancel_reason_label")}: {tr.cancel_reason}
                                                    </Text>
                                                )}

                                                <Steps
                                                    size="small"
                                                    current={stepIndexForTransfer(tr)}
                                                    status={cancelled ? "error" : undefined}
                                                    className={`transfer-steps mb-3 ${cancelled ? "transfer-steps--cancelled" : ""}`}
                                                    items={STEP_ORDER.map((key) => ({ title: t(`products.${STATUS_KEY[key]}`) }))}
                                                />

                                                <div className="flex gap-2 flex-wrap justify-end">
                                                    {tr.status === "requested" && hasSourceAccess(tr) && (
                                                        <Button
                                                            size="small"
                                                            icon={<CheckOutlined />}
                                                            loading={actionLoading}
                                                            onClick={() =>
                                                                runTransferAction(
                                                                    "approve",
                                                                    stockTransferService.approve,
                                                                    tr._id,
                                                                    "products.transfer_approved"
                                                                )
                                                            }
                                                            className="h-8 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                                                        >
                                                            {t("products.transfer_approve")}
                                                        </Button>
                                                    )}
                                                    {tr.status === "approved" && hasSourceAccess(tr) && (
                                                        <Button
                                                            size="small"
                                                            icon={<CarOutlined />}
                                                            loading={actionLoading}
                                                            onClick={() =>
                                                                runTransferAction(
                                                                    "ship",
                                                                    stockTransferService.ship,
                                                                    tr._id,
                                                                    "products.transfer_shipped"
                                                                )
                                                            }
                                                            className="h-8 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                                                        >
                                                            {t("products.transfer_ship")}
                                                        </Button>
                                                    )}
                                                    {tr.status === "in_transit" && hasDestinationAccess(tr) && (
                                                        <Button
                                                            size="small"
                                                            icon={<InboxOutlined />}
                                                            onClick={() => setReceiveFor(tr)}
                                                            className="h-8 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                                                        >
                                                            {t("products.transfer_receive")}
                                                        </Button>
                                                    )}
                                                    {["requested", "approved", "in_transit"].includes(tr.status) &&
                                                        (hasSourceAccess(tr) || hasDestinationAccess(tr)) && (
                                                        <Popconfirm
                                                            title={t("products.transfer_cancel_confirm_title")}
                                                            description={t("products.transfer_cancel_confirm_content")}
                                                            okText={t("common.yes")}
                                                            cancelText={t("common.no")}
                                                            onConfirm={() =>
                                                                runTransferAction(
                                                                    "cancel",
                                                                    stockTransferService.cancel,
                                                                    tr._id,
                                                                    "products.transfer_cancelled"
                                                                )
                                                            }
                                                        >
                                                            <Button
                                                                size="small"
                                                                danger
                                                                icon={<CloseOutlined />}
                                                                loading={actionLoading}
                                                                className="h-8 rounded-md"
                                                            >
                                                                {t("products.transfer_cancel")}
                                                            </Button>
                                                        </Popconfirm>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <TransferStockModal
                visible={quickOpen}
                product={product}
                pointsOfSale={visiblePointsOfSale}
                locationStock={(summary?.locations || []).map((row) => ({ point_of_sale_id: row.point_of_sale_id, stock: row.available }))}
                loading={actionLoading}
                onSubmit={handleQuickTransfer}
                onCancel={() => setQuickOpen(false)}
            />

            <RequestTransferModal
                visible={requestOpen}
                product={product}
                fromOptions={requestFromOptions}
                toOptions={visiblePointsOfSale}
                loading={actionLoading}
                onSubmit={handleRequest}
                onCancel={() => setRequestOpen(false)}
            />

            <ReceiveTransferModal
                visible={Boolean(receiveFor)}
                transfer={receiveFor}
                loading={actionLoading}
                onSubmit={handleReceive}
                onCancel={() => setReceiveFor(null)}
            />

            <TransferDetailModal
                visible={Boolean(detailFor)}
                transfer={detailFor}
                product={product}
                onCancel={() => setDetailFor(null)}
            />
        </div>
    );
};

export default LocationStockPanel;
