import { useEffect, useId, useState } from "react";
import PropTypes from "prop-types";
import { Drawer, Spin, Empty, Modal, Input, Select } from "antd";
import { CloseOutlined, LoadingOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import useIsMobile from "../../hooks/useIsMobile";
import { discoveryService } from "../../services/discoveryService";
import { resolveApiErrorMessage } from "../../utils/apiError";
import { useDiscoveries } from "../../context/DiscoveryContext";
import DiscoveryTypeIcon from "./DiscoveryTypeIcon";
import {
    DISCOVERY_TYPE_COLORS,
    DISCOVERY_STATUS_LABEL_COLORS,
    discoveryTypeLabelKey,
    discoveryStatusLabelKey,
    formatEvidenceValue,
    formatRelativeTime,
    initialsFor,
    labelForEvidenceKey,
    EXPLANATION_TAGS,
    explanationTagLabelKey,
    CHECKED_EXPLANATION_TAGS,
    EXPLANATION_OUTCOME_COLORS,
} from "./discoveryMeta";

// Same subscription/plan-gate codes as Discoveries.jsx's DISCOVERIES_CODE_MESSAGES
// - this drawer can also be opened straight from the DashboardLayout teaser
// widget, not just from the Discoveries list page, so it needs its own
// translation of enforcePlanFeature's 403 codes rather than the generic
// load_error toast. discovery_not_found (discovery.controller.js's getDiscovery)
// covers the stale-widget-card case: DiscoveryContext fetches its "published"
// list once per session, so a Discovery resolved/removed from outside that
// same session (another tab, a demo data reset, ...) can still be sitting in
// the widget/hero when the user clicks it.
const DISCOVERY_DETAIL_CODE_MESSAGES = {
    subscription_inactive: "discoveries.subscription_inactive",
    plan_feature_required: "discoveries.plan_feature_required",
    discovery_not_found: "discoveries.not_found",
};

const GaugeRing = ({ value, valueLabel, label, color }) => {
    const r = 34;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - Math.max(0, Math.min(1, value)));
    return (
        <svg width="84" height="84" viewBox="0 0 84 84">
            <circle cx="42" cy="42" r={r} fill="none" stroke="var(--ohnix-line-4)" strokeWidth="7" />
            <circle
                cx="42" cy="42" r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
                strokeDasharray={circumference} strokeDashoffset={offset} transform="rotate(-90 42 42)"
                style={{ transition: "stroke-dashoffset 600ms cubic-bezier(.22,1,.36,1)" }}
            />
            <text x="42" y="39" textAnchor="middle" fontSize="17" fontWeight="700" fill="var(--ohnix-text-primary)">{valueLabel}</text>
            <text x="42" y="52" textAnchor="middle" fontSize="7.5" fill="var(--ohnix-text-muted)" style={{ letterSpacing: "0.06em" }}>{label}</text>
        </svg>
    );
};
GaugeRing.propTypes = { value: PropTypes.number.isRequired, valueLabel: PropTypes.string.isRequired, label: PropTypes.string.isRequired, color: PropTypes.string.isRequired };

const Tick = ({ label, pct, color }) => (
    <div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--ohnix-text-muted)", marginBottom: 4 }}>
            <span>{label}</span>
            <span>{pct}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 999, background: "var(--ohnix-line-4)" }}>
            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: color }} />
        </div>
    </div>
);
Tick.propTypes = { label: PropTypes.string.isRequired, pct: PropTypes.number.isRequired, color: PropTypes.string.isRequired };

// A minimal SVG line+area chart for metric_series evidence - no axis
// chrome, just the shape of the series over time, so a trajectory shift or
// a growing gap reads as a shape instead of a column of numbers.
const MetricSeriesChart = ({ points, color }) => {
    const values = points.map((p) => Number(p.value));
    const min = Math.min(...values, 0);
    const max = Math.max(...values, 1);
    const range = max - min || 1;
    const w = 100;
    const h = 32;
    const coords = values.map((v, i) => {
        const x = points.length > 1 ? (i / (points.length - 1)) * w : w / 2;
        const y = h - ((v - min) / range) * h;
        return [x, y];
    });
    const linePath = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
    const areaPath = `${linePath} L${w},${h} L0,${h} Z`;
    // `color` is now a CSS var() reference (e.g. "var(--ohnix-status-amber)"),
    // not a hex string - it can't be used to build the gradient id
    // (parentheses aren't valid there, and a broken id silently breaks the
    // url(#id) fill reference below, which SVG then resolves as solid
    // black rather than failing loudly). Same useId() pattern
    // AssistantSparkleIcon already uses for its own gradient id.
    const gradId = useId();

    return (
        <div>
            <svg width="100%" height="72" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ display: "block" }}>
                <defs>
                    <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" style={{ stopColor: color, stopOpacity: 0.35 }} />
                        <stop offset="1" style={{ stopColor: color, stopOpacity: 0 }} />
                    </linearGradient>
                </defs>
                <path d={areaPath} fill={`url(#${gradId})`} stroke="none" />
                <path d={linePath} fill="none" stroke={color} strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "var(--ohnix-text-dim)", marginTop: 4 }}>
                <span>{points[0]?.month}</span>
                {points.length > 2 && <span>{points[Math.floor((points.length - 1) / 2)]?.month}</span>}
                <span>{points[points.length - 1]?.month}</span>
            </div>
        </div>
    );
};
MetricSeriesChart.propTypes = { points: PropTypes.arrayOf(PropTypes.object).isRequired, color: PropTypes.string.isRequired };

// Internal ids (product_id, customer_id...) carry no meaning for a reader
// and were never meant to be displayed - they exist so evidence.sourceId
// can link back to the record, not to be read as a stat.
const isInternalIdKey = (key) => /(^|_)id$/i.test(key);

const StatTileGrid = ({ data }) => {
    const { t } = useI18n();
    return (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
            {Object.entries(data)
                .filter(([key]) => !isInternalIdKey(key))
                .map(([key, value]) => (
                    <div key={key} style={{ padding: "10px 13px", borderRadius: 12, background: "var(--ohnix-surface-card-soft)", border: "1px solid var(--ohnix-line-3)" }}>
                        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--ohnix-text-dim)", marginBottom: 4 }}>
                            {labelForEvidenceKey(key, t)}
                        </div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: "var(--ohnix-text-primary)" }}>{formatEvidenceValue(key, value)}</div>
                    </div>
                ))}
        </div>
    );
};
StatTileGrid.propTypes = { data: PropTypes.object.isRequired };

const CohortChips = ({ rows, color }) => (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {rows.map((row, i) => {
            const name = row.customer_name || row.value || row.customer_id;
            return (
                <div
                    key={row.customer_id || row.value || i}
                    title={name}
                    style={{
                        width: 36, height: 36, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 11, fontWeight: 700, color,
                        background: `color-mix(in srgb, ${color} 12%, transparent)`,
                        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
                    }}
                >
                    {initialsFor(name)}
                </div>
            );
        })}
    </div>
);
CohortChips.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, color: PropTypes.string.isRequired };

const DistributionBars = ({ rows, rateKey, color }) => {
    const { t } = useI18n();
    const maxRate = Math.max(...rows.map((r) => Number(r[rateKey]) || 0), 1);
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
            {rows.map((row, i) => (
                <div key={row.value || i}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, color: "var(--ohnix-text-muted)", marginBottom: 3 }}>
                        <span style={{ textTransform: "capitalize" }}>{row.value}</span>
                        <span>{formatEvidenceValue(rateKey, row[rateKey])} · {t("discoveries.orders_count_short", { count: row.orders })}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--ohnix-line-4)" }}>
                        <div style={{ width: `${(Number(row[rateKey]) / maxRate) * 100}%`, height: "100%", borderRadius: 999, background: color }} />
                    </div>
                </div>
            ))}
        </div>
    );
};
DistributionBars.propTypes = { rows: PropTypes.arrayOf(PropTypes.object).isRequired, rateKey: PropTypes.string.isRequired, color: PropTypes.string.isRequired };

// Renders one evidence entry as whatever shape actually communicates it -
// a time series as a chart, a named cohort as chips, a rate distribution as
// bars, everything else as stat tiles - never a raw antd Table/Descriptions
// grid. Mission section 12 ("no caja negra"): this exists so any Discovery
// can be opened and its exact backing numbers inspected, just never as a
// spreadsheet.
const EvidenceBlock = ({ evidence, color }) => {
    const { kind, label, data } = evidence;
    const rows = Array.isArray(data) ? data : null;

    let body;
    if (kind === "metric_series" && rows?.length) {
        body = <MetricSeriesChart points={rows} color={color} />;
    } else if (rows?.length && (rows[0].customer_name !== undefined || rows[0].customer_id !== undefined)) {
        body = <CohortChips rows={rows} color={color} />;
    } else if (rows?.length) {
        const rateKey = Object.keys(rows[0]).find((k) => /pct$/i.test(k) && typeof rows[0][k] === "number");
        body = rateKey ? <DistributionBars rows={rows} rateKey={rateKey} color={color} /> : <StatTileGrid data={Object.fromEntries(rows.map((r, i) => [i, r]))} />;
    } else {
        body = <StatTileGrid data={data && typeof data === "object" ? data : {}} />;
    }

    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: "var(--ohnix-text-muted)", marginBottom: 10 }}>{label}</div>
            {body}
        </div>
    );
};
EvidenceBlock.propTypes = {
    evidence: PropTypes.shape({ kind: PropTypes.string, label: PropTypes.string, data: PropTypes.oneOfType([PropTypes.array, PropTypes.object]) }).isRequired,
    color: PropTypes.string.isRequired,
};

const noteIcons = {
    hypothesis: (
        <>
            <circle cx="10" cy="10" r="6.5" />
            <path d="M19 19l-4.5-4.5" />
        </>
    ),
    unknowns: (
        <>
            <path d="M9.5 9a2.5 2.5 0 0 1 5 .7c0 1.6-2.5 1.8-2.5 3.8" />
            <path d="M12 17.2h.01" />
            <circle cx="12" cy="12" r="9" />
        </>
    ),
    recommendation: (
        <>
            <path d="M9 18h6M10 21h4" />
            <path d="M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.2 1 2.5h6c0-1.3.4-1.9 1-2.5A6 6 0 0 0 12 3z" />
        </>
    ),
};

const NoteCard = ({ icon, title, children }) =>
    children ? (
        <div style={{ padding: "14px 15px 16px", borderRadius: 14, background: "var(--ohnix-surface-card-soft)", border: "1px solid var(--ohnix-line-3)" }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--ohnix-text-muted)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" style={{ marginBottom: 9 }}>
                {noteIcons[icon]}
            </svg>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ohnix-text-dim)", marginBottom: 5, textTransform: "uppercase" }}>{title}</div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: "var(--ohnix-text-muted)" }}>{children}</div>
        </div>
    ) : null;
NoteCard.propTypes = { icon: PropTypes.string.isRequired, title: PropTypes.string.isRequired, children: PropTypes.node };

// Same stroke-based, 24px-grid hand-drawn glyph vocabulary as
// DiscoveryTypeIcon/noteIcons above - kept out of the ant-design-icons font
// on purpose, so the status action row reads as this feature's own visual
// language rather than a generic antd Button toolbar.
const actionIcons = {
    actioned: <path d="M5 12.5l4.5 4.5L19 7.5" />,
    resolved: (
        <>
            <circle cx="12" cy="12" r="8.2" />
            <path d="M8.3 12.3l2.6 2.6L16 9.3" />
        </>
    ),
    dismissed: (
        <>
            <circle cx="12" cy="12" r="8.2" />
            <path d="M9.3 9.3l5.4 5.4M14.7 9.3l-5.4 5.4" />
        </>
    ),
};

// Status-tinted chip button - same color-mix idiom as the type/status badges
// throughout this feature (see DISCOVERY_TYPE_COLORS' comment in
// discoveryMeta.js), so marking a Discovery actioned/resolved/dismissed
// feels like one more state of the same visual system instead of a stock
// antd Button bolted underneath it.
const ActionButton = ({ icon, label, color, onClick, loading }) => (
    <button type="button" className="discovery-action-btn" style={{ "--btn-color": color }} onClick={onClick} disabled={loading}>
        {loading ? (
            <LoadingOutlined spin style={{ fontSize: 13 }} />
        ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                {actionIcons[icon]}
            </svg>
        )}
        <span>{label}</span>
    </button>
);
ActionButton.propTypes = {
    icon: PropTypes.oneOf(["actioned", "resolved", "dismissed"]).isRequired,
    label: PropTypes.string.isRequired,
    color: PropTypes.string.isRequired,
    onClick: PropTypes.func.isRequired,
    loading: PropTypes.bool,
};

// Renders the "explanation_check" evidence entry produced by
// Backend/services/discoveryExplanation.service.js when the team's stated
// explanation has a registered checker (see CHECKED_EXPLANATION_TAGS) - the
// evidence-backed verdict mission case G requires before Ohnix is allowed to
// treat a human explanation as confirmed, contradicted, or simply not
// checkable yet, instead of taking it at face value.
const ExplanationCheckCard = ({ check, t }) => {
    if (!check?.outcome) return null;
    const outcomeColor = EXPLANATION_OUTCOME_COLORS[check.outcome] || "var(--ohnix-text-dim)";
    return (
        <div style={{ marginBottom: 20, padding: "14px 16px", borderRadius: 14, background: `color-mix(in srgb, ${outcomeColor} 8%, transparent)`, border: `1px solid color-mix(in srgb, ${outcomeColor} 25%, transparent)` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ohnix-text-dim)", textTransform: "uppercase" }}>
                    {t("discoveries.section_explanation_check")}
                </div>
                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", padding: "3px 9px", borderRadius: 999, color: outcomeColor, background: `color-mix(in srgb, ${outcomeColor} 14%, transparent)` }}>
                    {t(`discoveries.explanation_outcome_${check.outcome}`).toUpperCase()}
                </span>
            </div>
            {check.notes && <p style={{ margin: "0 0 10px", fontSize: 12.5, lineHeight: 1.55, color: "var(--ohnix-text-soft)" }}>{check.notes}</p>}
            {(check.customers_with_history !== undefined || check.support_ratio_pct !== undefined) && (
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: "var(--ohnix-text-dim)" }}>
                    {check.support_ratio_pct !== undefined && <span>{t("discoveries.evidence.support_ratio_pct")}: <strong style={{ color: "var(--ohnix-text-muted)" }}>{check.support_ratio_pct}%</strong></span>}
                    {check.customers_with_history !== undefined && (
                        <span>{t("discoveries.evidence.customers_with_history")}: <strong style={{ color: "var(--ohnix-text-muted)" }}>{check.customers_with_history}/{check.customers_checked}</strong></span>
                    )}
                </div>
            )}
        </div>
    );
};
ExplanationCheckCard.propTypes = {
    check: PropTypes.shape({
        outcome: PropTypes.string,
        notes: PropTypes.string,
        support_ratio_pct: PropTypes.number,
        customers_with_history: PropTypes.number,
        customers_checked: PropTypes.number,
    }),
    t: PropTypes.func.isRequired,
};

// Mission case G, generalized: a team explanation attachable to ANY
// Discovery at ANY time (not just on dismiss) - shown here so the drawer is
// where both sides of the story live together: what Ohnix found, and what
// the team said about it. Saving re-runs the backend's evidence check when
// the (detectorKey, tag) pair has one registered (see
// discoveryExplanation.service.js's CHECKERS), which is why onSaved swaps in
// the FULL detail response rather than patching just the explanation fields -
// a fresh explanation_check evidence entry can appear as a side effect.
const TeamExplanationSection = ({ detail, discoveryId, onSaved, t }) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [draftText, setDraftText] = useState("");
    const [draftTag, setDraftTag] = useState(null);
    const [saving, setSaving] = useState(false);

    const openModal = () => {
        setDraftText(detail.team_explanation || "");
        setDraftTag(detail.team_explanation_tag || null);
        setModalOpen(true);
    };

    const save = async () => {
        if (!draftText.trim()) return;
        setSaving(true);
        try {
            const updated = await discoveryService.setExplanation(discoveryId, draftText.trim(), draftTag || undefined);
            onSaved(updated);
            toast.success(t("discoveries.explanation_saved"));
            setModalOpen(false);
        } catch {
            toast.error(t("discoveries.explanation_save_error"));
        } finally {
            setSaving(false);
        }
    };

    const checkedTags = CHECKED_EXPLANATION_TAGS[detail.detector_key] || [];

    return (
        <div style={{ marginBottom: 20, padding: "16px 18px", borderRadius: 14, background: "var(--ohnix-surface-card-soft)", border: "1px solid var(--ohnix-line-3)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: detail.team_explanation ? 8 : 0, gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ohnix-text-dim)" }}>
                    {t("discoveries.section_team_explanation")}
                </div>
                <button type="button" className="discovery-ghost-btn" onClick={openModal}>
                    {detail.team_explanation ? t("discoveries.explanation_edit") : t("discoveries.explanation_add")}
                </button>
            </div>
            {detail.team_explanation && (
                <div>
                    <p style={{ margin: "0 0 6px", fontSize: 12.5, lineHeight: 1.55, color: "var(--ohnix-text-soft)" }}>&quot;{detail.team_explanation}&quot;</p>
                    <div style={{ fontSize: 10.5, color: "var(--ohnix-text-dim)" }}>
                        {detail.team_explanation_tag && <span>{t(explanationTagLabelKey(detail.team_explanation_tag))}</span>}
                        {detail.team_explanation_tag && detail.team_explanation_at && <span> · </span>}
                        {detail.team_explanation_at && <span>{formatRelativeTime(detail.team_explanation_at, t)}</span>}
                    </div>
                </div>
            )}

            <Modal
                className="discovery-modal"
                rootClassName="discovery-modal"
                open={modalOpen}
                title={detail.team_explanation ? t("discoveries.explanation_edit") : t("discoveries.explanation_add")}
                onCancel={() => setModalOpen(false)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                        <button type="button" className="discovery-ghost-btn" onClick={() => setModalOpen(false)}>
                            {t("common.cancel")}
                        </button>
                        <button type="button" className="discovery-action-btn" style={{ "--btn-color": "var(--ohnix-accent-2)" }} disabled={saving || !draftText.trim()} onClick={save}>
                            {saving && <LoadingOutlined spin style={{ fontSize: 13 }} />}
                            <span>{t("discoveries.explanation_save")}</span>
                        </button>
                    </div>
                }
            >
                <p style={{ fontSize: 13, color: "var(--ohnix-text-muted)", marginBottom: 10 }}>{t("discoveries.explanation_prompt")}</p>
                <Input.TextArea value={draftText} onChange={(e) => setDraftText(e.target.value)} placeholder={t("discoveries.explanation_placeholder")} autoSize={{ minRows: 2, maxRows: 5 }} style={{ marginBottom: 12 }} />
                <Select
                    value={draftTag}
                    onChange={setDraftTag}
                    allowClear
                    placeholder={t("discoveries.explanation_tag_placeholder")}
                    style={{ width: "100%" }}
                    options={EXPLANATION_TAGS.map((tag) => ({
                        value: tag,
                        label: checkedTags.includes(tag) ? `${t(explanationTagLabelKey(tag))} · ${t("discoveries.explanation_tag_checkable")}` : t(explanationTagLabelKey(tag)),
                    }))}
                />
            </Modal>
        </div>
    );
};
TeamExplanationSection.propTypes = {
    detail: PropTypes.shape({
        team_explanation: PropTypes.string,
        team_explanation_tag: PropTypes.string,
        team_explanation_at: PropTypes.string,
        detector_key: PropTypes.string,
    }).isRequired,
    discoveryId: PropTypes.string.isRequired,
    onSaved: PropTypes.func.isRequired,
    t: PropTypes.func.isRequired,
};

const DiscoveryDetailDrawer = ({ open, discoveryId, onClose, onStatusChanged }) => {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    const { removeLocally } = useDiscoveries();
    const [detail, setDetail] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [updatingStatus, setUpdatingStatus] = useState(null);
    const [dismissModalOpen, setDismissModalOpen] = useState(false);
    const [dismissReasonDraft, setDismissReasonDraft] = useState("");

    useEffect(() => {
        if (!open || !discoveryId) return;
        setLoading(true);
        setDetail(null);
        setLoadError(null);
        discoveryService
            .get(discoveryId)
            .then(setDetail)
            .catch((error) => {
                const message = resolveApiErrorMessage(error, t, DISCOVERY_DETAIL_CODE_MESSAGES, "discoveries.load_error");
                setLoadError(message);
                toast.error(message);
                // The widget/hero's own list only refreshes on mount - if this
                // one 404s, it's gone server-side, so drop it from that shared
                // cache now instead of leaving a dead card to click again.
                if (error?.response?.data?.code === "discovery_not_found") removeLocally(discoveryId);
            })
            .finally(() => setLoading(false));
    }, [open, discoveryId, t, removeLocally]);

    const handleStatusChange = async (status, reason) => {
        setUpdatingStatus(status);
        try {
            const updated = await discoveryService.updateStatus(discoveryId, status, reason);
            setDetail((prev) =>
                prev ? { ...prev, status: updated.status, resolved_at: updated.resolved_at, dismiss_reason: updated.dismiss_reason, dismissed_at: updated.dismissed_at } : prev
            );
            onStatusChanged?.(updated);
            toast.success(t("discoveries.status_updated"));
        } catch {
            toast.error(t("discoveries.status_update_error"));
        } finally {
            setUpdatingStatus(null);
        }
    };

    const confirmDismiss = async () => {
        await handleStatusChange("dismissed", dismissReasonDraft.trim() || undefined);
        setDismissModalOpen(false);
        setDismissReasonDraft("");
    };

    const color = detail ? DISCOVERY_TYPE_COLORS[detail.type] || DISCOVERY_TYPE_COLORS.new_pattern : "var(--ohnix-accent-2)";

    return (
        <Drawer rootClassName="discovery-drawer" open={open} onClose={onClose} width={isMobile ? "100vw" : 560} closeIcon={<CloseOutlined style={{ color: "var(--ohnix-text-muted)" }} />} title={null} destroyOnClose styles={{ body: { paddingTop: 8 } }}>
            {loading && (
                <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
                    <Spin />
                </div>
            )}

            {!loading && !detail && <Empty description={loadError || t("discoveries.load_error")} />}

            {!loading && detail && (
                <div>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 22 }}>
                        <div
                            style={{
                                flexShrink: 0, width: 46, height: 46, borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center",
                                background: `color-mix(in srgb, ${color} 12%, transparent)`, border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`, color,
                            }}
                        >
                            <DiscoveryTypeIcon type={detail.type} size={22} />
                        </div>
                        <div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", padding: "4px 10px", borderRadius: 999, color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
                                    {t(discoveryTypeLabelKey(detail.type)).toUpperCase()}
                                </span>
                                {detail.status === "published" ? (
                                    <span style={{ fontSize: 11, color: "var(--ohnix-text-dim)" }}>{formatRelativeTime(detail.first_detected_at, t)}</span>
                                ) : (
                                    <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", color: DISCOVERY_STATUS_LABEL_COLORS[detail.status] }}>
                                        {t(discoveryStatusLabelKey(detail.status)).toUpperCase()}
                                    </span>
                                )}
                            </div>
                            <h2 style={{ margin: 0, fontSize: 19, lineHeight: 1.35, fontWeight: 700, color: "var(--ohnix-text-primary)" }}>{detail.title}</h2>
                        </div>
                    </div>

                    <div style={{ position: "relative", marginBottom: 24 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ohnix-text-dim)", marginBottom: 8 }}>
                            {t("discoveries.section_what_found")}
                        </div>
                        <svg width="30" height="22" viewBox="0 0 34 26" style={{ position: "absolute", right: 0, top: 0, opacity: 0.5 }} aria-hidden="true">
                            <path d="M0 26V15.5C0 6.9 5.4 1.2 13.6 0l1 3.6C9 5 6.3 8.4 6 13h7.6V26H0zm18.4 0V15.5c0-8.6 5.4-14.3 13.6-15.5l1 3.6c-5.6 1.4-8.3 4.8-8.6 9.4H32V26H18.4z" fill={color} />
                        </svg>
                        <p style={{ margin: 0, maxWidth: 460, fontSize: 14, lineHeight: 1.65, color: "var(--ohnix-text-soft)" }}>{detail.summary}</p>
                    </div>

                    <div style={{ padding: "20px 20px 16px", marginBottom: 20, borderRadius: 16, background: "var(--ohnix-surface-card-soft)", border: "1px solid var(--ohnix-line-3)" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ohnix-text-dim)", marginBottom: 14 }}>
                            {t("discoveries.section_confidence")}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 26, flexWrap: "wrap" }}>
                            <GaugeRing value={detail.confidence} valueLabel={`${Math.round(detail.confidence * 100)}%`} label={t("discoveries.score_confidence").toUpperCase()} color="var(--ohnix-text-soft)" />
                            <GaugeRing value={detail.priority_score / 10} valueLabel={detail.priority_score.toFixed(1)} label={t("discoveries.priority_score_label").toUpperCase()} color={color} />
                            <div style={{ flex: 1, minWidth: 160, display: "flex", flexDirection: "column", gap: 10 }}>
                                <Tick label={t("discoveries.score_impact")} pct={Math.round(detail.impact_score * 100)} color={color} />
                                <Tick label={t("discoveries.score_urgency")} pct={Math.round(detail.urgency_score * 100)} color={color} />
                                <Tick label={t("discoveries.score_novelty")} pct={Math.round(detail.novelty_score * 100)} color={color} />
                            </div>
                        </div>
                    </div>

                    {Array.isArray(detail.evidence) && detail.evidence.length > 0 && (
                        <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ohnix-text-dim)", marginBottom: 12 }}>
                                {t("discoveries.section_evidence")}
                            </div>
                            {detail.evidence
                                .filter((e) => !["perception_gap", "learned_confidence", "explanation_check"].includes(e.kind))
                                .map((evidence) => (
                                    <EvidenceBlock key={evidence._id} evidence={evidence} color={color} />
                                ))}
                        </div>
                    )}

                    {detail.evidence?.some((e) => e.kind === "perception_gap") && (
                        <div style={{ marginBottom: 20, padding: "14px 16px", borderRadius: 14, background: "color-mix(in srgb, var(--ohnix-status-purple) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--ohnix-status-purple) 25%, transparent)" }}>
                            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", color: "var(--ohnix-status-purple)", marginBottom: 6, textTransform: "uppercase" }}>
                                {t("discoveries.section_perception_gap")}
                            </div>
                            {detail.evidence
                                .filter((e) => e.kind === "perception_gap")
                                .map((e) => (
                                    <div key={e._id} style={{ fontSize: 12.5, lineHeight: 1.55, color: "var(--ohnix-text-soft)" }}>
                                        &quot;{e.data.previous_explanation}&quot; — {e.data.note}
                                    </div>
                                ))}
                        </div>
                    )}

                    {detail.evidence
                        ?.filter((e) => e.kind === "explanation_check")
                        .map((e) => (
                            <ExplanationCheckCard key={e._id} check={e.data} t={t} />
                        ))}

                    <TeamExplanationSection detail={detail} discoveryId={discoveryId} onSaved={setDetail} t={t} />

                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
                        <NoteCard icon="hypothesis" title={t("discoveries.section_hypothesis")}>{detail.hypothesis}</NoteCard>
                        <NoteCard icon="unknowns" title={t("discoveries.section_unknowns")}>{detail.unknowns}</NoteCard>
                        <NoteCard icon="recommendation" title={t("discoveries.section_recommendation")}>{detail.recommendation}</NoteCard>
                    </div>

                    {Array.isArray(detail.predictions) && detail.predictions.length > 0 && (
                        <div style={{ marginBottom: 24 }}>
                            {detail.predictions.map((prediction) => (
                                <div key={prediction._id} style={{ display: "flex", gap: 13, alignItems: "center", padding: "13px 16px", borderRadius: 14, background: "var(--ohnix-surface-card-soft)", border: "1px solid var(--ohnix-line-3)" }}>
                                    <div style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 11, background: "var(--ohnix-line-2)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--ohnix-text-muted)" }}>
                                        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></svg>
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "var(--ohnix-text-soft)" }}>{prediction.statement}</div>
                                        <div style={{ fontSize: 10.5, color: "var(--ohnix-text-dim)", marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                                            <span>{t("discoveries.check_after_label").toUpperCase()} {new Date(prediction.check_after).toLocaleDateString()}</span>
                                            {prediction.outcome && (
                                                <span style={{ fontWeight: 700, color: prediction.outcome === "correct" ? "var(--ohnix-status-success)" : prediction.outcome === "incorrect" ? "var(--ohnix-status-danger)" : "var(--ohnix-text-dim)" }}>
                                                    · {t(`discoveries.prediction_outcome_${prediction.outcome}`).toUpperCase()}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {detail.status === "dismissed" && detail.dismiss_reason && (
                        <div style={{ marginBottom: 20, fontSize: 12, color: "var(--ohnix-text-dim)" }}>
                            {t("discoveries.your_dismiss_reason_label")}: <span style={{ color: "var(--ohnix-text-muted)" }}>&quot;{detail.dismiss_reason}&quot;</span>
                        </div>
                    )}

                    {!["resolved", "dismissed"].includes(detail.status) && (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, paddingTop: 18, borderTop: "1px solid var(--ohnix-line-3)" }}>
                            <ActionButton icon="actioned" color="var(--ohnix-accent-2)" label={t("discoveries.action_mark_actioned")} loading={updatingStatus === "actioned"} onClick={() => handleStatusChange("actioned")} />
                            <ActionButton icon="resolved" color="var(--ohnix-status-success)" label={t("discoveries.action_mark_resolved")} loading={updatingStatus === "resolved"} onClick={() => handleStatusChange("resolved")} />
                            <ActionButton icon="dismissed" color="var(--ohnix-status-danger)" label={t("discoveries.action_dismiss")} loading={updatingStatus === "dismissed"} onClick={() => setDismissModalOpen(true)} />
                        </div>
                    )}
                </div>
            )}

            <Modal
                className="discovery-modal"
                rootClassName="discovery-modal"
                open={dismissModalOpen}
                title={t("discoveries.dismiss_confirm")}
                onCancel={() => setDismissModalOpen(false)}
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                        <button type="button" className="discovery-ghost-btn" onClick={() => setDismissModalOpen(false)}>
                            {t("common.cancel")}
                        </button>
                        <button type="button" className="discovery-danger-btn" disabled={updatingStatus === "dismissed"} onClick={confirmDismiss}>
                            {updatingStatus === "dismissed" && <LoadingOutlined spin style={{ fontSize: 13 }} />}
                            {t("discoveries.action_dismiss")}
                        </button>
                    </div>
                }
            >
                <p style={{ fontSize: 13, color: "var(--ohnix-text-muted)", marginBottom: 8 }}>{t("discoveries.dismiss_reason_prompt")}</p>
                <Input.TextArea value={dismissReasonDraft} onChange={(e) => setDismissReasonDraft(e.target.value)} placeholder={t("discoveries.dismiss_reason_placeholder")} autoSize={{ minRows: 2, maxRows: 4 }} />
            </Modal>
        </Drawer>
    );
};

DiscoveryDetailDrawer.propTypes = {
    open: PropTypes.bool.isRequired,
    discoveryId: PropTypes.string,
    onClose: PropTypes.func.isRequired,
    onStatusChanged: PropTypes.func,
};

export default DiscoveryDetailDrawer;
