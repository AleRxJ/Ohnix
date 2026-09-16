import React, { useCallback, useEffect, useState } from "react";
import { Typography, Spin, Button, Tag } from "antd";
import { ExperimentOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { api } from "../../api/api";
import { useDataInvalidation } from "../../hooks/useDataInvalidation";
import { getConnectivityState } from "../../offline/connectivity";
import { subscribeSyncCompleted } from "../../offline/syncEngine";
import { mirrorGet, mirrorUpsert } from "../../offline/entityQueue";
import EmptyState from "../common/EmptyState";

const { Text } = Typography;

const MS_PER_DAY = 86400000;

// Soonest-expiring-first list of a tracksBatches product's open lots - read
// only (this feature's write paths already go through the same purchase/
// adjustment/transfer flows every other product uses, see
// productBatch.service.js). Renders nothing for a product that doesn't
// track lots, same "hide entirely, don't show an empty section" rule
// LocationStockPanel uses for single-location accounts.
const BatchesPanel = ({ product }) => {
    const { t, currentLanguage } = useI18n();
    const [batches, setBatches] = useState([]);
    const [status, setStatus] = useState("loading");

    const load = useCallback(async () => {
        if (!product?._id) return;
        if (!getConnectivityState()) {
            const cached = await mirrorGet("productBatches", product._id);
            setBatches(cached?.batches || []);
            setStatus("loaded");
            return;
        }
        setStatus((prev) => (prev === "loaded" ? prev : "loading"));
        try {
            const res = await api.get(`/products/${product._id}/batches`);
            const nextBatches = res?.data?.data || [];
            setBatches(nextBatches);
            setStatus("loaded");
            mirrorUpsert("productBatches", { _id: product._id, batches: nextBatches });
        } catch (err) {
            if (!err.response) {
                const cached = await mirrorGet("productBatches", product._id);
                setBatches(cached?.batches || []);
                setStatus("loaded");
                return;
            }
            toast.error(err?.response?.data?.message || t("common.error"));
            setStatus("error");
        }
    }, [product?._id, t]);

    useEffect(() => {
        load();
    }, [load]);

    // A purchase receipt, adjustment, or transfer completing anywhere -
    // this device or another - is exactly what would change this list, same
    // "product" event LocationStockPanel already listens for.
    useDataInvalidation("product", load);
    useEffect(() => subscribeSyncCompleted(load), [load]);

    if (!product?.tracks_batches) return null;

    const daysUntil = (dateStr) => {
        if (!dateStr) return null;
        return Math.ceil((new Date(dateStr).getTime() - Date.now()) / MS_PER_DAY);
    };

    const expiryTag = (dateStr) => {
        const days = daysUntil(dateStr);
        if (days === null) return <Tag>{t("products.batch_no_expiration")}</Tag>;
        if (days < 0) return <Tag color="#ef4444">{t("products.batch_expired")}</Tag>;
        if (days <= 30) return <Tag color="#f59e0b">{t("products.batch_expires_in_days", { days })}</Tag>;
        return <Tag color="#29D8D5">{t("products.batch_expires_in_days", { days })}</Tag>;
    };

    return (
        <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--ohnix-line-4)] flex items-center gap-2">
                <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-gradient-to-br from-[#f59e0b]/20 to-[#f59e0b]/5 border border-[var(--ohnix-line-4)]">
                    <ExperimentOutlined className="text-[#f59e0b]" />
                </div>
                <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{t("products.batches_title")}</Text>
            </div>
            <div className="p-5">
                {status === "loading" ? (
                    <div className="flex justify-center py-6">
                        <Spin size="small" />
                    </div>
                ) : status === "error" ? (
                    <div className="flex flex-col items-center justify-center gap-3 py-6 text-center">
                        <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.failed_load_batches")}</Text>
                        <Button size="small" onClick={load}>
                            {t("products.retry_load")}
                        </Button>
                    </div>
                ) : batches.length === 0 ? (
                    <EmptyState
                        icon={<ExperimentOutlined />}
                        title={getConnectivityState() ? t("products.no_batches") : t("products.batches_offline_hint")}
                        compact
                    />
                ) : (
                    <div className="space-y-2 max-h-80 overflow-y-auto pr-1 ohnix-scrollbar-thin">
                        {batches.map((b) => (
                            <div
                                key={b._id}
                                className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2 flex items-center justify-between gap-3"
                            >
                                <div className="min-w-0">
                                    <Text className="text-sm font-semibold text-[var(--ohnix-text-primary)] block truncate">
                                        {b.batch_number}
                                    </Text>
                                    <Text className="text-[11px] text-[var(--ohnix-text-dim)] block truncate">
                                        {b.point_of_sale_name}
                                        {b.expiration_date &&
                                            ` · ${new Date(b.expiration_date).toLocaleDateString(currentLanguage, { year: "numeric", month: "short", day: "numeric" })}`}
                                    </Text>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <Text className="text-sm font-bold text-[var(--ohnix-text-primary)]">{b.quantity}</Text>
                                    {expiryTag(b.expiration_date)}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default BatchesPanel;
