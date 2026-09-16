import React, { useEffect, useState } from "react";
import { Card, Switch, Tag, Spin } from "antd";
import { RadarChartOutlined, PlayCircleOutlined, LoadingOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { api } from "../../api/api";
import { discoveryService } from "../../services/discoveryService";

const CROSS_FACTOR_DETECTOR_KEY = "cross_factor_correlation";

// Friendly names for every detectorKey DiscoveryPatternStats can carry -
// falls back to a humanized version of the key (same idiom as
// discoveryMeta.js's labelForEvidenceKey) so a future detector still shows
// something readable before anyone gets around to naming it here.
const DETECTOR_LABELS = {
    sales_vs_cash_gap: "Brecha ventas vs. efectivo",
    customer_churn_risk: "Riesgo de pérdida de clientes",
    customer_product_lookalike: "Clientes similares (producto)",
    supplier_delay_customer_connection: "Retraso de proveedor y clientes",
    trajectory_shift: "Cambio de trayectoria",
    new_pattern_return_rate: "Patrón nuevo (devoluciones)",
    cross_factor_correlation: "Correlación cruzada",
};
const humanizeDetectorKey = (key) => DETECTOR_LABELS[key] || key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

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
    const [patternStats, setPatternStats] = useState([]);
    const [savingKey, setSavingKey] = useState(null);
    const [running, setRunning] = useState(false);

    const loadStatus = async () => {
        const statusResponse = await api.get("/scheduler/status");
        setSchedulerStatus(statusResponse.data?.data?.discovery || null);
    };

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [statusResponse, dims, stats] = await Promise.all([
                    api.get("/scheduler/status"),
                    discoveryService.listDimensionConfig(CROSS_FACTOR_DETECTOR_KEY),
                    discoveryService.getPatternStats(),
                ]);
                if (cancelled) return;
                setSchedulerStatus(statusResponse.data?.data?.discovery || null);
                setDimensions(dims || []);
                setPatternStats(stats || []);
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

    const runNow = async () => {
        setRunning(true);
        toast(t("admin.discovery_run_now_started"), { icon: "⏳" });
        try {
            await discoveryService.runSchedulerNow();
            await loadStatus();
            toast.success(t("admin.discovery_run_now_success"));
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setRunning(false);
        }
    };

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
                <div className="mb-1 flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--ohnix-text-primary)]">
                        <RadarChartOutlined className="text-[#44F3F0]" />
                        {t("admin.discovery_scheduler_title")}
                    </div>
                    <button
                        type="button"
                        className="discovery-action-btn"
                        style={{ "--btn-color": "var(--ohnix-accent-2)" }}
                        disabled={running}
                        onClick={runNow}
                    >
                        {running ? <LoadingOutlined spin style={{ fontSize: 13 }} /> : <PlayCircleOutlined style={{ fontSize: 13 }} />}
                        <span>{t("admin.discovery_run_now")}</span>
                    </button>
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

            <Card className="module-shell border border-[var(--ohnix-line-4)]">
                <div className="mb-1 text-sm font-bold text-[var(--ohnix-text-primary)]">{t("admin.discovery_accuracy_title")}</div>
                <p className="mb-4 text-xs text-[var(--ohnix-text-dim)]">{t("admin.discovery_accuracy_hint")}</p>

                {patternStats.length === 0 ? (
                    <span className="text-xs text-[var(--ohnix-text-dim)]">{t("admin.discovery_accuracy_empty")}</span>
                ) : (
                    <div className="flex flex-col divide-y divide-[var(--ohnix-line-4)]">
                        {patternStats.map((stat) => (
                            <div key={stat.detector_key} className="flex items-center justify-between gap-3 py-3 flex-wrap">
                                <div>
                                    <div className="text-xs font-medium text-[var(--ohnix-text-primary)]">{humanizeDetectorKey(stat.detector_key)}</div>
                                    <div className="text-[11px] text-[var(--ohnix-text-dim)]">
                                        {t("admin.discovery_accuracy_count", {
                                            correct: stat.correct_predictions,
                                            total: stat.total_predictions,
                                        })}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {stat.accuracy_pct !== null && (
                                        <Tag color={stat.accuracy_pct >= 60 ? "success" : stat.accuracy_pct >= 40 ? "warning" : "error"}>
                                            {t("admin.discovery_accuracy_pct", { pct: stat.accuracy_pct })}
                                        </Tag>
                                    )}
                                    <Tag>{t("admin.discovery_learned_confidence", { pct: stat.current_confidence_pct })}</Tag>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
    );
};

export default DiscoveryEngineTab;
