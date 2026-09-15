import React, { useEffect, useState } from "react";
import { Card, Switch, Tag, Spin } from "antd";
import { RadarChartOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { api } from "../../api/api";
import { discoveryService } from "../../services/discoveryService";

const CROSS_FACTOR_DETECTOR_KEY = "cross_factor_correlation";

// Companion screen to Backend/services/discoveryDimensionConfig.service.js -
// this is the whole reason that table exists as data instead of a hardcoded
// array: an operator can widen or narrow what cross_factor_correlation
// searches from here, no deploy, no touching the database directly. See
// crossFactorCorrelation.detector.js's DIMENSION_REGISTRY comment for the
// safety argument (extraction logic stays in reviewed code, only WHICH of
// it runs lives here).
const DiscoveryEngineTab = () => {
    const { t } = useI18n();
    const [loading, setLoading] = useState(true);
    const [schedulerStatus, setSchedulerStatus] = useState(null);
    const [dimensions, setDimensions] = useState([]);
    const [savingKey, setSavingKey] = useState(null);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [statusResponse, dims] = await Promise.all([
                    api.get("/scheduler/status"),
                    discoveryService.listDimensionConfig(CROSS_FACTOR_DETECTOR_KEY),
                ]);
                if (cancelled) return;
                setSchedulerStatus(statusResponse.data?.data?.discovery || null);
                setDimensions(dims || []);
            } catch (error) {
                if (!cancelled) toast.error(error.response?.data?.message || t("common.error"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const toggleDimension = async (dimensionKey, enabled) => {
        setSavingKey(dimensionKey);
        const previous = dimensions;
        setDimensions((prev) => prev.map((d) => (d.key === dimensionKey ? { ...d, enabled } : d)));
        try {
            await discoveryService.setDimensionConfig({ detectorKey: CROSS_FACTOR_DETECTOR_KEY, dimensionKey, enabled });
            toast.success(t("admin.discovery_dimension_saved"));
        } catch (error) {
            setDimensions(previous);
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setSavingKey(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-10">
                <Spin />
            </div>
        );
    }

    const lastResult = schedulerStatus?.lastResult;

    return (
        <div className="space-y-5">
            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--ohnix-text-primary)]">
                    <RadarChartOutlined className="text-[#44F3F0]" />
                    {t("admin.discovery_scheduler_title")}
                </div>
                <p className="mb-4 text-xs text-[var(--ohnix-text-dim)]">{t("admin.discovery_scheduler_hint")}</p>

                {!schedulerStatus ? (
                    <span className="text-xs text-[var(--ohnix-text-dim)]">{t("admin.discovery_scheduler_unavailable")}</span>
                ) : (
                    <div className="flex flex-col gap-2 text-xs text-[var(--ohnix-text-muted)]">
                        <div className="flex items-center gap-2 flex-wrap">
                            <Tag color={schedulerStatus.isRunning ? "success" : "default"}>
                                {schedulerStatus.isRunning ? t("admin.discovery_scheduler_running") : t("admin.discovery_scheduler_stopped")}
                            </Tag>
                            {schedulerStatus.nextRun && (
                                <span>
                                    {t("admin.discovery_scheduler_next_run")}: {new Date(schedulerStatus.nextRun).toLocaleString()}
                                </span>
                            )}
                        </div>
                        {schedulerStatus.lastRunAt && (
                            <span>
                                {t("admin.discovery_scheduler_last_run")}: {new Date(schedulerStatus.lastRunAt).toLocaleString()}
                            </span>
                        )}
                        {lastResult?.error && <Tag color="error">{lastResult.error}</Tag>}
                        {lastResult && !lastResult.error && (
                            <span>
                                {t("admin.discovery_scheduler_last_result", {
                                    created: lastResult.created,
                                    updated: lastResult.updated,
                                    failed: lastResult.failed,
                                    metricWritersFailed: lastResult.metricWritersFailed ?? 0,
                                })}
                            </span>
                        )}
                    </div>
                )}
            </Card>

            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <div className="mb-1 text-sm font-bold text-[var(--ohnix-text-primary)]">{t("admin.discovery_dimensions_title")}</div>
                <p className="mb-4 text-xs text-[var(--ohnix-text-dim)]">{t("admin.discovery_dimensions_hint")}</p>

                <div className="flex flex-col divide-y divide-[var(--ohnix-line-4)]">
                    {dimensions.map((dimension) => (
                        <div key={dimension.key} className="flex items-center justify-between gap-3 py-3">
                            <div>
                                <div className="text-xs font-medium text-[var(--ohnix-text-primary)]">{dimension.label}</div>
                                {!dimension.has_override && (
                                    <div className="text-[11px] text-[var(--ohnix-text-dim)]">
                                        {dimension.default_enabled ? t("admin.discovery_dimension_default_on") : t("admin.discovery_dimension_default_off")}
                                    </div>
                                )}
                            </div>
                            <Switch
                                checked={dimension.enabled}
                                loading={savingKey === dimension.key}
                                onChange={(checked) => toggleDimension(dimension.key, checked)}
                            />
                        </div>
                    ))}
                </div>
            </Card>
        </div>
    );
};

export default DiscoveryEngineTab;
