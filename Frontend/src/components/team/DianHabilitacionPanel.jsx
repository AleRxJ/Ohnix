/* eslint-disable react/prop-types */
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Collapse, Input, Modal, Popconfirm, Statistic, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, ExperimentOutlined, QuestionCircleOutlined, ReloadOutlined, RocketOutlined, StopOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { companyService } from "../../services/companyService";
import { resolveApiErrorMessage } from "../../utils/apiError";

const { Text, Title } = Typography;

const RUN_STATUS_COLOR = { pending: "default", running: "blue", completed: "green", failed: "red", cancelled: "default" };
const DOC_STATUS_COLOR = { pending: "default", sending: "blue", sent: "gold", accepted: "green", rejected: "red", error: "red" };
const ACTIVE_STATUSES = ["pending", "running"];

// Self-service counterpart to AdminDianTestMatrix.jsx - same underlying
// engine (Backend/services/dianTestMatrix.service.js), reached via
// Backend/routes/dianTestMatrixSelf.routes.js (owner-scoped, no companyId
// ever accepted from the client). testSetId itself still has to come from
// DIAN's own habilitación portal (no public API issues it) - everything
// after that (start/monitor/cancel/request production) the owner drives
// themselves. Deliberately simplified vs the admin table: pass/fail +
// simple counts by default, the raw 50-row breakdown is opt-in.
//
// Visual language matches this page's other self-service cards
// (FirmaPassSelfService.jsx, NumberingResolutionForm above): icon-header,
// var(--ohnix-*) tokens + dark-alert-* classes (never a raw hex outside the
// brand accent already used for icons/hover glow elsewhere), bordered
// bg-[var(--ohnix-line-1)] sub-panels for each distinct state, antd
// Statistic/Table for structured data instead of ad-hoc text/HTML tables.
const DianHabilitacionPanel = ({ knownTestSetId }) => {
    const { t } = useI18n();
    const [runs, setRuns] = useState([]);
    const [loadingRuns, setLoadingRuns] = useState(true);
    // company.itcycleTestSetId (set by an admin during provisioning/support -
    // see companySelf.controller.js's getMyItcycleStatus) pre-fills this
    // instead of making the owner hunt for a value Ohnix may already have on
    // file. Still editable - support may not have set it, or the company may
    // be re-running habilitación under a newer set.
    const [testSetId, setTestSetId] = useState(knownTestSetId || "");
    const [activeRun, setActiveRun] = useState(null);
    const [busy, setBusy] = useState("");
    const [whereModalOpen, setWhereModalOpen] = useState(false);
    const pollRef = useRef(null);
    // Stable per mount, rotated after a real success - same reasoning as the
    // idempotency keys elsewhere on this page (ElectronicInvoicingSettings.jsx,
    // FirmaPassSelfService.jsx): a genuine retry replays the cached result
    // instead of starting a second run / sending a second request.
    const [startIdempotencyKey, setStartIdempotencyKey] = useState(() => crypto.randomUUID());
    const [productionIdempotencyKey, setProductionIdempotencyKey] = useState(() => crypto.randomUUID());

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const loadRuns = async () => {
        try {
            setLoadingRuns(true);
            const response = await companyService.listMyDianTestMatrixRuns();
            setRuns(response?.data || []);
        } catch {
            // Best-effort - the start form still works even if history fails to load.
        } finally {
            setLoadingRuns(false);
        }
    };

    const viewRun = async (runId) => {
        stopPolling();
        try {
            const response = await companyService.getMyDianTestMatrixRun(runId);
            setActiveRun(response?.data || null);
            if (response?.data && ACTIVE_STATUSES.includes(response.data.status)) {
                pollRef.current = setInterval(async () => {
                    try {
                        const refreshed = await companyService.getMyDianTestMatrixRun(runId);
                        setActiveRun(refreshed?.data || null);
                        if (!ACTIVE_STATUSES.includes(refreshed?.data?.status)) {
                            stopPolling();
                            loadRuns();
                        }
                    } catch {
                        // Transient poll failure - next tick retries, nothing to surface mid-run.
                    }
                }, 4000);
            }
        } catch {
            // Run may have just been deleted/inaccessible - leave activeRun as-is.
        }
    };

    useEffect(() => {
        loadRuns();
        return () => stopPolling();
    }, []);

    // knownTestSetId arrives async (the parent's own status fetch) - it can
    // still be undefined on first render. Fills the field once it shows up,
    // but only while the owner hasn't already typed something themselves.
    useEffect(() => {
        if (knownTestSetId && !testSetId) setTestSetId(knownTestSetId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [knownTestSetId]);

    // Once the history loads, auto-open whichever run is most relevant: an
    // in-progress one first (so a page reload mid-run resumes polling
    // automatically), otherwise the most recent one.
    useEffect(() => {
        if (activeRun || runs.length === 0) return;
        const inProgress = runs.find((r) => ACTIVE_STATUSES.includes(r.status));
        viewRun((inProgress || runs[0]).id);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runs]);

    // startDianTestMatrixRun's own readiness check is the single source of
    // truth for what's missing (environment_must_be_sandbox,
    // dian_configuration, active_certificate, numbering_resolution_01/91/92)
    // - translated here rather than re-derived from readiness client-side,
    // same reasoning as FirmaPassSelfService.jsx's describeMissingReadiness.
    const describeMissingCodes = (error) => {
        const codes = error?.response?.data?.errors;
        if (!Array.isArray(codes) || codes.length === 0) return null;
        const labels = {
            environment_must_be_sandbox: t("fiscal_setup.habilitacion_missing_environment_must_be_sandbox"),
            dian_configuration: t("fiscal_setup.habilitacion_missing_dian_configuration"),
            active_certificate: t("fiscal_setup.habilitacion_missing_active_certificate"),
            numbering_resolution_01: t("fiscal_setup.habilitacion_missing_numbering_resolution_01"),
            numbering_resolution_91: t("fiscal_setup.habilitacion_missing_numbering_resolution_91"),
            numbering_resolution_92: t("fiscal_setup.habilitacion_missing_numbering_resolution_92"),
        };
        const known = codes.map((code) => labels[code]).filter(Boolean);
        return known.length > 0 ? t("fiscal_setup.habilitacion_missing_intro", { items: known.join(", ") }) : null;
    };

    const startRun = async () => {
        const trimmed = testSetId.trim();
        if (!trimmed) return;
        try {
            setBusy("start");
            const response = await companyService.startMyDianTestMatrixRun({ testSetId: trimmed }, startIdempotencyKey);
            toast.success(t("fiscal_setup.habilitacion_start_success"));
            setTestSetId("");
            setStartIdempotencyKey(crypto.randomUUID());
            await loadRuns();
            await viewRun(response.data.id);
        } catch (error) {
            toast.error(describeMissingCodes(error) || resolveApiErrorMessage(error, t, {}, "fiscal_setup.habilitacion_start_error"));
        } finally {
            setBusy("");
        }
    };

    const cancelRun = async () => {
        if (!activeRun) return;
        try {
            setBusy("cancel");
            await companyService.cancelMyDianTestMatrixRun(activeRun.id);
            toast.success(t("fiscal_setup.habilitacion_cancel_requested"));
            await viewRun(activeRun.id);
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, {}, "fiscal_setup.habilitacion_start_error"));
        } finally {
            setBusy("");
        }
    };

    const requestProduction = async () => {
        if (!activeRun) return;
        try {
            setBusy("request-production");
            await companyService.requestMyDianProductionActivation(activeRun.id, productionIdempotencyKey);
            toast.success(t("fiscal_setup.habilitacion_request_production_success"));
            setProductionIdempotencyKey(crypto.randomUUID());
            setActiveRun((prev) => (prev ? { ...prev, productionRequested: true } : prev));
        } catch (error) {
            toast.error(resolveApiErrorMessage(error, t, {}, "fiscal_setup.habilitacion_start_error"));
        } finally {
            setBusy("");
        }
    };

    const summaryCounts = (run, type) => run?.summary?.[type] || {};
    const summaryTotal = (run, type) => Object.values(summaryCounts(run, type)).reduce((sum, n) => sum + n, 0);

    const documentColumns = [
        { title: t("fiscal_setup.habilitacion_col_sequence"), dataIndex: "sequence", key: "sequence", width: 60 },
        { title: t("fiscal_setup.habilitacion_col_type"), dataIndex: "documentType", key: "documentType", render: (v) => <Tag>{v}</Tag> },
        {
            title: t("fiscal_setup.habilitacion_col_status"),
            dataIndex: "status",
            key: "status",
            render: (value) => <Tag color={DOC_STATUS_COLOR[value] || "default"}>{t(`fiscal_setup.habilitacion_doc_status_${value}`)}</Tag>,
        },
        { title: t("fiscal_setup.habilitacion_col_cufe"), dataIndex: "cufe", key: "cufe", render: (v) => (v ? <span className="font-mono text-xs">{`${v.slice(0, 10)}…`}</span> : "—") },
        { title: t("fiscal_setup.habilitacion_col_description"), key: "description", render: (_, r) => r.errorMessage || r.statusDescription || "—" },
    ];

    const historyColumns = [
        { title: "Test Set ID", dataIndex: "testSetId", key: "testSetId", render: (v) => <span className="font-mono text-xs">{v}</span> },
        { title: t("fiscal_setup.start_date"), dataIndex: "createdAt", key: "createdAt", render: (v) => new Date(v).toLocaleString() },
        {
            title: t("fiscal_setup.habilitacion_col_status"),
            dataIndex: "status",
            key: "status",
            render: (value, r) => (
                <Tag color={RUN_STATUS_COLOR[value] || "default"}>
                    {t(`fiscal_setup.habilitacion_status_${value}`)}
                    {value === "completed" && r.passResult !== null ? (r.passResult ? " ✓" : " ✗") : ""}
                </Tag>
            ),
        },
        {
            title: "",
            key: "actions",
            render: (_, r) => <Button size="small" onClick={() => viewRun(r.id)}>{t("fiscal_setup.habilitacion_view_run")}</Button>,
        },
    ];

    const canRequestProduction = activeRun?.status === "completed" && activeRun?.passResult === true;
    const startDisabled = !testSetId.trim() || Boolean(activeRun && ACTIVE_STATUSES.includes(activeRun.status));

    return (
        <Card className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
            <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[#29D8D5]/10">
                    <ExperimentOutlined className="text-lg text-[#44F3F0]" />
                </div>
                <div>
                    <Title level={5} className="m-0 text-[var(--ohnix-text-primary)]">{t("fiscal_setup.habilitacion_title")}</Title>
                    <Text className="text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.habilitacion_subtitle")}</Text>
                </div>
            </div>

            <Alert
                className="mt-4 dark-alert dark-alert-purple"
                type="info"
                showIcon
                message={t("fiscal_setup.habilitacion_explainer")}
                action={
                    <Button size="small" type="text" icon={<QuestionCircleOutlined />} onClick={() => setWhereModalOpen(true)}>
                        {t("fiscal_setup.habilitacion_where_toggle")}
                    </Button>
                }
            />
            <Alert className="mt-3 dark-alert dark-alert-amber" type="warning" showIcon message={t("fiscal_setup.habilitacion_warning_title")} description={t("fiscal_setup.habilitacion_warning_hint")} />

            <Modal
                title={t("fiscal_setup.habilitacion_where_toggle")}
                open={whereModalOpen}
                onCancel={() => setWhereModalOpen(false)}
                footer={<Button type="primary" onClick={() => setWhereModalOpen(false)}>{t("fiscal_setup.habilitacion_confirm_ok")}</Button>}
            >
                <Text className="text-sm text-[var(--ohnix-text-soft)]">{t("fiscal_setup.habilitacion_where_hint")}</Text>
            </Modal>

            <div className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex-1" style={{ minWidth: 240 }}>
                        <label className="mb-1 block text-sm font-medium text-[var(--ohnix-text-primary)]">{t("fiscal_setup.habilitacion_test_set_id_label")}</label>
                        <Input
                            size="large"
                            className="auth-ohnix-input"
                            value={testSetId}
                            onChange={(e) => setTestSetId(e.target.value)}
                            placeholder={t("fiscal_setup.habilitacion_test_set_id_placeholder")}
                            disabled={Boolean(activeRun && ACTIVE_STATUSES.includes(activeRun.status))}
                        />
                        {knownTestSetId && testSetId === knownTestSetId && (
                            <Text className="mt-1 block text-xs text-[#44F3F0]">{t("fiscal_setup.habilitacion_test_set_id_known")}</Text>
                        )}
                    </div>
                    <Popconfirm
                        title={t("fiscal_setup.habilitacion_confirm_title")}
                        description={t("fiscal_setup.habilitacion_confirm_description")}
                        okText={t("fiscal_setup.habilitacion_confirm_ok")}
                        cancelText={t("fiscal_setup.habilitacion_confirm_cancel")}
                        onConfirm={startRun}
                        disabled={startDisabled}
                    >
                        <Button
                            type="primary"
                            className="hover:shadow-[0_0_26px_rgba(41,216,213,0.22)]"
                            icon={<ExperimentOutlined />}
                            loading={busy === "start"}
                            disabled={startDisabled}
                        >
                            {t("fiscal_setup.habilitacion_start_button")}
                        </Button>
                    </Popconfirm>
                </div>
            </div>

            {activeRun && (
                <div className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                            <Tag color={RUN_STATUS_COLOR[activeRun.status] || "default"}>
                                {t(`fiscal_setup.habilitacion_status_${activeRun.status}`)}
                            </Tag>
                            {activeRun.status === "completed" && (
                                <Tag color={activeRun.passResult ? "green" : "red"} icon={activeRun.passResult ? <CheckCircleOutlined /> : undefined}>
                                    {t(activeRun.passResult ? "fiscal_setup.habilitacion_pass_true" : "fiscal_setup.habilitacion_pass_false")}
                                </Tag>
                            )}
                        </div>
                        {ACTIVE_STATUSES.includes(activeRun.status) && (
                            <Button size="small" danger icon={<StopOutlined />} loading={busy === "cancel"} onClick={cancelRun}>
                                {t("fiscal_setup.habilitacion_cancel_button")}
                            </Button>
                        )}
                    </div>

                    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <Statistic title={t("fiscal_setup.document_type_invoice")} value={`${summaryTotal(activeRun, "invoice")}/${activeRun.invoiceTarget}`} suffix={summaryCounts(activeRun, "invoice").accepted ? `· ${summaryCounts(activeRun, "invoice").accepted} ✓` : undefined} />
                        <Statistic title={t("fiscal_setup.document_type_credit_note")} value={`${summaryTotal(activeRun, "creditNote")}/${activeRun.creditNoteTarget}`} suffix={summaryCounts(activeRun, "creditNote").accepted ? `· ${summaryCounts(activeRun, "creditNote").accepted} ✓` : undefined} />
                        <Statistic title={t("fiscal_setup.document_type_debit_note")} value={`${summaryTotal(activeRun, "debitNote")}/${activeRun.debitNoteTarget}`} suffix={summaryCounts(activeRun, "debitNote").accepted ? `· ${summaryCounts(activeRun, "debitNote").accepted} ✓` : undefined} />
                    </div>

                    {activeRun.errorMessage && (
                        <Alert className="mt-4 dark-alert dark-alert-amber" type="warning" showIcon message={activeRun.errorMessage} />
                    )}

                    {canRequestProduction && (
                        <Alert
                            className="mt-4 dark-alert dark-alert-teal"
                            type="success"
                            showIcon
                            message={t("fiscal_setup.habilitacion_ready_title")}
                            description={t("fiscal_setup.habilitacion_ready_hint")}
                            action={
                                <Button
                                    size="small"
                                    type="primary"
                                    icon={<RocketOutlined />}
                                    loading={busy === "request-production"}
                                    disabled={Boolean(activeRun.productionRequested)}
                                    onClick={requestProduction}
                                >
                                    {activeRun.productionRequested
                                        ? t("fiscal_setup.habilitacion_request_production_sent")
                                        : t("fiscal_setup.habilitacion_request_production_button")}
                                </Button>
                            }
                        />
                    )}

                    <Collapse
                        className="mt-4"
                        items={[{
                            key: "technical",
                            label: t("fiscal_setup.habilitacion_technical_detail_toggle"),
                            children: (
                                <div className="overflow-x-auto">
                                    <Table
                                        size="small"
                                        rowKey="id"
                                        columns={documentColumns}
                                        dataSource={activeRun.documents || []}
                                        pagination={{ pageSize: 10 }}
                                    />
                                </div>
                            ),
                        }]}
                    />
                </div>
            )}

            <div className="mt-4 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                <div className="mb-2 flex items-center justify-between">
                    <Text className="block text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-muted)]">
                        {t("fiscal_setup.habilitacion_history_title")}
                    </Text>
                    <Button size="small" type="text" icon={<ReloadOutlined />} loading={loadingRuns} onClick={loadRuns} />
                </div>
                {runs.length === 0 && !loadingRuns ? (
                    <Text className="block text-xs text-[var(--ohnix-text-muted)]">{t("fiscal_setup.habilitacion_history_empty")}</Text>
                ) : (
                    <div className="overflow-x-auto">
                        <Table
                            size="small"
                            rowKey="id"
                            loading={loadingRuns}
                            columns={historyColumns}
                            dataSource={runs}
                            pagination={{ pageSize: 5 }}
                        />
                    </div>
                )}
            </div>
        </Card>
    );
};

export default DianHabilitacionPanel;
