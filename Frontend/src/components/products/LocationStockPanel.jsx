import React, { useCallback, useEffect, useState } from "react";
import { Typography, Spin, Tag, Button, Popconfirm } from "antd";
import { SwapOutlined, SendOutlined, CheckOutlined, CarOutlined, InboxOutlined, CloseOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import useSubscription from "../../hooks/useSubscription";
import { api } from "../../api/api";
import { pointOfSaleService } from "../../services/pointOfSaleService";
import { stockTransferService } from "../../services/stockTransferService";
import TransferStockModal from "./TransferStockModal";
import RequestTransferModal from "./RequestTransferModal";
import ReceiveTransferModal from "./ReceiveTransferModal";

const { Text } = Typography;

const STATUS_TAG = {
    requested: { color: "default", key: "transfer_status_requested" },
    approved: { color: "blue", key: "transfer_status_approved" },
    in_transit: { color: "gold", key: "transfer_status_in_transit" },
    received: { color: "green", key: "transfer_status_received" },
    cancelled: { color: "red", key: "transfer_status_cancelled" },
};

// Per-location breakdown (available / in transit / total, matching the
// 2026-08-21 multi-location inventory spec's example table) plus the
// transfer workflow for this one product - both live here rather than in
// ProductDetailsDrawer directly, same one-component-per-concern split as
// AdjustStockModal/TransferStockModal. Renders nothing for accounts with
// only one location: with a single point of sale there's nothing to break
// down or move between.
const LocationStockPanel = ({ product }) => {
    const { t } = useI18n();
    const { can } = useSubscription();
    const [pointsOfSale, setPointsOfSale] = useState([]);
    const [summary, setSummary] = useState(null);
    const [transfers, setTransfers] = useState([]);
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

    const loadAll = useCallback(async () => {
        if (!product?._id) return;
        setStatus((prev) => (prev === "loaded" ? prev : "loading"));
        try {
            const [posRes, stockRes, transfersRes] = await Promise.all([
                pointOfSaleService.list(),
                api.get(`/products/${product._id}/location-stock`),
                stockTransferService.list({ productId: product._id }),
            ]);
            setPointsOfSale((posRes?.data || []).filter((pos) => pos.isActive));
            setSummary(stockRes?.data?.data || null);
            setTransfers(transfersRes?.data || []);
            setStatus("loaded");
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
            setStatus("error");
        }
    }, [product?._id, t]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    // payload is already shaped for the API (from_point_of_sale_id,
    // to_point_of_sale_id, quantity, reason) - see TransferStockModal's
    // own onSubmit call.
    const handleQuickTransfer = async (productId, payload) => {
        setActionLoading(true);
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

    const runTransferAction = async (action, transferId, successKey, extra) => {
        setActionLoading(true);
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
            (id, p) => stockTransferService.receive(id, p),
            transferId,
            "products.transfer_received",
            payload
        );
        setReceiveFor(null);
    };

    if (!can("multiLocation")) return null;
    // Only hide for genuinely having one location once a load has actually
    // succeeded and confirmed it - see the `status` state's comment above
    // for why this can't just be "!loading".
    if (status === "loaded" && pointsOfSale.length <= 1) return null;

    return (
        <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)]">
            <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)] flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <SwapOutlined className="text-[#29D8D5]" />
                    <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{t("products.location_stock_title")}</Text>
                </div>
                <div className="flex gap-2">
                    <Button size="small" icon={<SendOutlined />} onClick={() => setRequestOpen(true)}>
                        {t("products.request_transfer")}
                    </Button>
                    <Button size="small" type="primary" icon={<SwapOutlined />} onClick={() => setQuickOpen(true)}>
                        {t("products.transfer_stock")}
                    </Button>
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
                        <Text className="text-xs text-[var(--ohnix-text-dim)] block mb-3">{t("products.location_stock_hint")}</Text>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-[var(--ohnix-text-dim)] text-xs uppercase tracking-wide">
                                        <th className="pb-2 font-semibold">{t("products.location_column")}</th>
                                        <th className="pb-2 font-semibold text-right">{t("products.location_available")}</th>
                                        <th className="pb-2 font-semibold text-right">{t("products.location_in_transit")}</th>
                                        <th className="pb-2 font-semibold text-right">{t("products.location_total")}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(summary?.locations || []).map((row) => (
                                        <tr key={row.point_of_sale_id} className="border-t border-[var(--ohnix-line-3)]">
                                            <td className="py-2 text-[var(--ohnix-text-primary)]">{row.point_of_sale_name}</td>
                                            <td className="py-2 text-right text-[var(--ohnix-text-primary)] tabular-nums">{row.available}</td>
                                            <td className="py-2 text-right text-[var(--ohnix-text-dim)] tabular-nums">
                                                {row.in_transit > 0 ? row.in_transit : "—"}
                                            </td>
                                            <td className="py-2 text-right font-semibold text-[#44F3F0] tabular-nums">{row.total}</td>
                                        </tr>
                                    ))}
                                    {summary?.totals && (
                                        <tr className="border-t border-[var(--ohnix-line-4)]">
                                            <td className="py-2 font-bold text-[var(--ohnix-text-primary)]">{t("products.location_grand_total")}</td>
                                            <td className="py-2 text-right font-bold text-[var(--ohnix-text-primary)] tabular-nums">{summary.totals.available}</td>
                                            <td className="py-2 text-right font-bold text-[var(--ohnix-text-dim)] tabular-nums">
                                                {summary.totals.inTransit > 0 ? summary.totals.inTransit : "—"}
                                            </td>
                                            <td className="py-2 text-right font-bold text-[#44F3F0] tabular-nums">{summary.totals.total}</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-5 pt-4 border-t border-[var(--ohnix-line-3)]">
                            <Text className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] block mb-3">
                                {t("products.pending_transfers_title")}
                            </Text>
                            {transfers.length === 0 ? (
                                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.no_pending_transfers")}</Text>
                            ) : (
                                <div className="space-y-2">
                                    {transfers.map((tr) => {
                                        const statusMeta = STATUS_TAG[tr.status] || STATUS_TAG.requested;
                                        return (
                                            <div
                                                key={tr._id}
                                                className="flex flex-col gap-2 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
                                            >
                                                <div className="min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <Tag color={statusMeta.color} className="!m-0">{t(`products.${statusMeta.key}`)}</Tag>
                                                        <Text className="text-sm text-[var(--ohnix-text-primary)]">
                                                            {t("products.transfer_from_to", {
                                                                from: tr.from_point_of_sale?.name || "—",
                                                                to: tr.to_point_of_sale?.name || "—",
                                                            })}
                                                        </Text>
                                                        <Text className="text-sm font-semibold text-[#44F3F0]">{tr.quantity_sent}</Text>
                                                    </div>
                                                    {tr.discrepancy > 0 && (
                                                        <Text className="text-xs text-red-400 block mt-0.5">
                                                            {t("products.transfer_discrepancy_label")}: {tr.discrepancy}
                                                        </Text>
                                                    )}
                                                </div>
                                                <div className="flex gap-2 flex-shrink-0">
                                                    {tr.status === "requested" && (
                                                        <Button
                                                            size="small"
                                                            icon={<CheckOutlined />}
                                                            loading={actionLoading}
                                                            onClick={() =>
                                                                runTransferAction(
                                                                    stockTransferService.approve,
                                                                    tr._id,
                                                                    "products.transfer_approved"
                                                                )
                                                            }
                                                        >
                                                            {t("products.transfer_approve")}
                                                        </Button>
                                                    )}
                                                    {tr.status === "approved" && (
                                                        <Button
                                                            size="small"
                                                            icon={<CarOutlined />}
                                                            loading={actionLoading}
                                                            onClick={() =>
                                                                runTransferAction(
                                                                    stockTransferService.ship,
                                                                    tr._id,
                                                                    "products.transfer_shipped"
                                                                )
                                                            }
                                                        >
                                                            {t("products.transfer_ship")}
                                                        </Button>
                                                    )}
                                                    {tr.status === "in_transit" && (
                                                        <Button
                                                            size="small"
                                                            type="primary"
                                                            icon={<InboxOutlined />}
                                                            onClick={() => setReceiveFor(tr)}
                                                        >
                                                            {t("products.transfer_receive")}
                                                        </Button>
                                                    )}
                                                    {["requested", "approved", "in_transit"].includes(tr.status) && (
                                                        <Popconfirm
                                                            title={t("products.transfer_cancel_confirm_title")}
                                                            description={t("products.transfer_cancel_confirm_content")}
                                                            okText={t("common.yes")}
                                                            cancelText={t("common.no")}
                                                            onConfirm={() =>
                                                                runTransferAction(
                                                                    stockTransferService.cancel,
                                                                    tr._id,
                                                                    "products.transfer_cancelled"
                                                                )
                                                            }
                                                        >
                                                            <Button size="small" danger icon={<CloseOutlined />} loading={actionLoading}>
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
                pointsOfSale={pointsOfSale}
                locationStock={(summary?.locations || []).map((row) => ({ point_of_sale_id: row.point_of_sale_id, stock: row.available }))}
                loading={actionLoading}
                onSubmit={handleQuickTransfer}
                onCancel={() => setQuickOpen(false)}
            />

            <RequestTransferModal
                visible={requestOpen}
                product={product}
                pointsOfSale={pointsOfSale}
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
        </div>
    );
};

export default LocationStockPanel;
