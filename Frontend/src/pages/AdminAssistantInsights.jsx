// Frontend/src/pages/AdminAssistantInsights.jsx
//
// Platform-admin-only view of the assistant's learning loop
// (Backend/services/assistantLearning.service.js): how often guiding a
// company on each detected finding actually cleared it, which questions the
// assistant flagged it couldn't answer (the to-do list for the knowledge
// base / app map), and which replies people rated down. Cross-company
// data, so only an Ohnix admin sees it - same gate as the other admin pages.
import { useContext, useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Button, Progress, Segmented, Table, Tag, Tooltip } from "antd";
import { BulbOutlined, DisconnectOutlined, ReloadOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import dayjs from "dayjs";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import PageHeader from "../components/common/PageHeader";
import { assistantService } from "../services/assistantService";
import { getConnectivityState, subscribeConnectivity } from "../offline/connectivity";

const PERIOD_OPTIONS = [7, 30, 90];
// Mirrors the backend's trust threshold for feeding the rate back into the
// prompt (assistantCompanyState.service.js MIN_TRACK_SAMPLES / LOW_SUCCESS_RATE).
const MIN_TRACK_SAMPLES = 5;
const LOW_SUCCESS_RATE = 0.4;

const StatTile = ({ label, value, hint }) => (
    <div className="module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-4">
        <div className="text-xs text-[var(--ohnix-text-muted)]">{label}</div>
        <div className="text-2xl font-bold mt-1">{value}</div>
        {hint && <div className="text-xs text-[var(--ohnix-text-muted)] mt-1">{hint}</div>}
    </div>
);

StatTile.propTypes = {
    label: PropTypes.node.isRequired,
    value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    hint: PropTypes.node,
};

const AdminAssistantInsights = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [days, setDays] = useState(30);
    const [loading, setLoading] = useState(true);
    const [insights, setInsights] = useState(null);
    const [online, setOnline] = useState(() => getConnectivityState());

    useEffect(() => subscribeConnectivity(setOnline), []);

    const load = async (period = days) => {
        if (!online) return;
        setLoading(true);
        try {
            setInsights(await assistantService.getInsights(period));
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isAdmin) load(days);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, days, online]);

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.only_admin")} />
            </div>
        );
    }

    const findingLabel = (key) => {
        const label = t(`assistant_insights.finding_${key}`);
        return label === `assistant_insights.finding_${key}` ? key : label;
    };

    // Findings that have only pending guidance (nothing checked yet) still
    // belong in the table - they show the loop is running.
    const guidanceRows = insights
        ? [
              ...insights.guidance,
              ...insights.pending_without_history.map((row) => ({ ...row, total_checked: 0, resolved: 0, success_rate: null })),
          ]
        : [];
    const totals = guidanceRows.reduce(
        (acc, row) => ({ checked: acc.checked + row.total_checked, resolved: acc.resolved + row.resolved, pending: acc.pending + row.pending }),
        { checked: 0, resolved: 0, pending: 0 }
    );

    const guidanceColumns = [
        { title: t("assistant_insights.col_finding"), dataIndex: "finding_key", key: "finding", render: (key) => <span>{findingLabel(key)}</span> },
        { title: t("assistant_insights.col_checked"), dataIndex: "total_checked", key: "checked", align: "right", width: 110 },
        { title: t("assistant_insights.col_resolved"), dataIndex: "resolved", key: "resolved", align: "right", width: 110 },
        {
            title: <Tooltip title={t("assistant_insights.success_rate_help")}>{t("assistant_insights.col_success_rate")}</Tooltip>,
            key: "rate",
            width: 220,
            render: (_, row) => {
                if (row.success_rate === null || row.total_checked === 0) {
                    return <span className="text-[var(--ohnix-text-muted)]">{t("assistant_insights.no_checks_yet")}</span>;
                }
                const percent = Math.round(row.success_rate * 100);
                const low = row.total_checked >= MIN_TRACK_SAMPLES && row.success_rate < LOW_SUCCESS_RATE;
                return (
                    <div className="flex items-center gap-2">
                        <Progress percent={percent} size="small" showInfo={false} status={low ? "exception" : "normal"} className="flex-1 !mb-0" />
                        <span className="w-10 text-right">{percent}%</span>
                        {row.total_checked < MIN_TRACK_SAMPLES && (
                            <Tooltip title={t("assistant_insights.few_samples_help", { count: MIN_TRACK_SAMPLES })}><Tag>{t("assistant_insights.few_samples")}</Tag></Tooltip>
                        )}
                        {low && (
                            <Tooltip title={t("assistant_insights.low_rate_help")}><Tag color="red">{t("assistant_insights.low_rate")}</Tag></Tooltip>
                        )}
                    </div>
                );
            },
        },
        { title: t("assistant_insights.col_pending"), dataIndex: "pending", key: "pending", align: "right", width: 110 },
    ];

    const whereLabel = (row) => [row.module, row.tab].filter(Boolean).join(" › ") || "—";

    const gapColumns = [
        { title: t("assistant_insights.col_question"), dataIndex: "question", key: "question" },
        { title: t("assistant_insights.col_where"), key: "where", width: 200, render: (_, row) => whereLabel(row) },
        { title: t("assistant_insights.col_date"), dataIndex: "createdAt", key: "date", width: 150, render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
    ];

    const downvoteColumns = [
        { title: t("assistant_insights.col_reply"), dataIndex: "reply", key: "reply", ellipsis: { showTitle: false }, render: (value) => <Tooltip title={value} placement="topLeft">{value}</Tooltip> },
        { title: t("assistant_insights.col_comment"), dataIndex: "comment", key: "comment", width: 260, render: (value) => value || "—" },
        { title: t("assistant_insights.col_where"), dataIndex: "module", key: "module", width: 140, render: (value) => value || "—" },
        { title: t("assistant_insights.col_date"), dataIndex: "created_at", key: "date", width: 150, render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader title={t("assistant_insights.title")} subtitle={t("assistant_insights.subtitle")} icon={<BulbOutlined />} />

            {!online && <Alert className="dark-alert dark-alert-amber" type="warning" showIcon icon={<DisconnectOutlined />} message={t("assistant_insights.offline")} />}

            <div className="flex flex-wrap items-center gap-3">
                <Segmented
                    value={days}
                    onChange={setDays}
                    options={PERIOD_OPTIONS.map((value) => ({ value, label: t("assistant_insights.last_days", { count: value }) }))}
                />
                <Button icon={<ReloadOutlined />} onClick={() => load(days)} loading={loading} disabled={!online}>
                    {t("reports.refresh_report")}
                </Button>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatTile
                    label={t("assistant_insights.stat_success_rate")}
                    value={totals.checked ? `${Math.round((totals.resolved / totals.checked) * 100)}%` : "—"}
                    hint={t("assistant_insights.stat_success_rate_hint", { resolved: totals.resolved, checked: totals.checked })}
                />
                <StatTile label={t("assistant_insights.stat_pending")} value={totals.pending} hint={t("assistant_insights.stat_pending_hint")} />
                <StatTile label={t("assistant_insights.stat_gaps")} value={insights?.knowledge_gaps.length ?? "—"} hint={t("assistant_insights.stat_period_hint", { count: days })} />
                <StatTile label={t("assistant_insights.stat_downvotes")} value={insights?.downvoted_replies.length ?? "—"} hint={t("assistant_insights.stat_period_hint", { count: days })} />
            </div>

            <div className="module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-4 sm:p-6">
                <h3 className="text-base font-semibold mb-1">{t("assistant_insights.guidance_title")}</h3>
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("assistant_insights.guidance_help")}</p>
                <Table
                    className="module-dark-table"
                    loading={loading}
                    rowKey="finding_key"
                    columns={guidanceColumns}
                    dataSource={guidanceRows}
                    pagination={false}
                    scroll={{ x: 760 }}
                    locale={{ emptyText: t("assistant_insights.guidance_empty") }}
                />
            </div>

            <div className="module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-4 sm:p-6">
                <h3 className="text-base font-semibold mb-1">{t("assistant_insights.gaps_title")}</h3>
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("assistant_insights.gaps_help")}</p>
                <Table
                    className="module-dark-table"
                    loading={loading}
                    rowKey={(row) => `${row.createdAt}-${row.question}`}
                    columns={gapColumns}
                    dataSource={insights?.knowledge_gaps || []}
                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                    scroll={{ x: 640 }}
                    locale={{ emptyText: t("assistant_insights.gaps_empty") }}
                />
            </div>

            <div className="module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-4 sm:p-6">
                <h3 className="text-base font-semibold mb-1">{t("assistant_insights.downvotes_title")}</h3>
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("assistant_insights.downvotes_help")}</p>
                <Table
                    className="module-dark-table"
                    loading={loading}
                    rowKey={(row) => `${row.created_at}-${row.reply.slice(0, 20)}`}
                    columns={downvoteColumns}
                    dataSource={insights?.downvoted_replies || []}
                    pagination={{ pageSize: 10, hideOnSinglePage: true }}
                    scroll={{ x: 760 }}
                    locale={{ emptyText: t("assistant_insights.downvotes_empty") }}
                />
            </div>
        </div>
    );
};

export default AdminAssistantInsights;
