import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Empty, Input, Popconfirm, Select, Statistic, Table, Tag } from "antd";
import { ExperimentOutlined, ReloadOutlined, SearchOutlined, StopOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { adminService } from "../services/adminService";
import PageHeader from "../components/common/PageHeader";
import { getCertificateLabel } from "../utils/electronicInvoicingProvider";

const RUN_STATUS_COLOR = { pending: "default", running: "blue", completed: "green", failed: "red", cancelled: "default" };
const DOC_STATUS_COLOR = { pending: "default", sending: "blue", sent: "gold", accepted: "green", rejected: "red", error: "red" };
const DOCUMENT_TYPE_LABEL = { invoice: "01", creditNote: "91", debitNote: "92" };

// Admin-only tool to run the DIAN habilitación "set de pruebas" for a
// company already provisioned with itcycle-api-dian - see
// Backend/services/dianTestMatrix.service.js. This is the "onboarding
// asistido" piece for the DIAN software step specifically - unlike
// FirmaPass's certificate flow (client self-service), a client can't
// reasonably run this themselves.
const AdminDianTestMatrix = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [companies, setCompanies] = useState([]);
    const [companyId, setCompanyId] = useState(undefined);
    const [testSetId, setTestSetId] = useState("");
    const [starting, setStarting] = useState(false);
    const [cancelling, setCancelling] = useState(false);

    const [runs, setRuns] = useState([]);
    const [activeRun, setActiveRun] = useState(null);
    const [loadingRuns, setLoadingRuns] = useState(true);
    const pollRef = useRef(null);

    // Run history grows with every client that goes through DIAN habilitación
    // - same reasoning as AdminFirmaPassValidations.jsx, this needs to stay
    // searchable/filterable rather than one long unfiltered table.
    const [historySearch, setHistorySearch] = useState("");
    const [historyStatusFilter, setHistoryStatusFilter] = useState(null);

    const loadCompanies = async () => {
        try {
            const response = await adminService.listCompanies();
            setCompanies(response?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const loadRuns = async () => {
        try {
            setLoadingRuns(true);
            const response = await adminService.listDianTestMatrixRuns();
            setRuns(response?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoadingRuns(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        loadCompanies();
        loadRuns();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const stopPolling = () => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    };

    const viewRun = async (runId) => {
        stopPolling();
        try {
            const response = await adminService.getDianTestMatrixRun(runId);
            setActiveRun(response?.data || null);
            if (response?.data && ["pending", "running"].includes(response.data.status)) {
                pollRef.current = setInterval(async () => {
                    try {
                        const refreshed = await adminService.getDianTestMatrixRun(runId);
                        setActiveRun(refreshed?.data || null);
                        if (!["pending", "running"].includes(refreshed?.data?.status)) {
                            stopPolling();
                            loadRuns();
                        }
                    } catch {
                        // Transient poll failure - next tick retries, nothing to surface mid-run.
                    }
                }, 4000);
            }
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    useEffect(() => () => stopPolling(), []);

    const companyNameById = (id) => companies.find((c) => c.id === id)?.name || id;

    const filteredRuns = useMemo(() => {
        const needle = historySearch.trim().toLowerCase();
        return runs.filter((r) => {
            if (historyStatusFilter && r.status !== historyStatusFilter) return false;
            if (!needle) return true;
            return [companyNameById(r.companyId), r.testSetId].filter(Boolean).some((field) => field.toLowerCase().includes(needle));
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [runs, companies, historySearch, historyStatusFilter]);

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.only_admin")} />
            </div>
        );
    }

    const activeCompanyRun = runs.find((r) => r.companyId === companyId && ["pending", "running"].includes(r.status));

    // Same reasoning as DianHabilitacionPanel's runCertificate - all
    // documents in a run are normally signed with the same certificate.
    const runCertificate = (run) => (run?.documents || []).find((d) => d.certificateProvider) || null;

    const startRun = async () => {
        if (!companyId || !testSetId.trim()) return;
        try {
            setStarting(true);
            const response = await adminService.startDianTestMatrixRun({ companyId, testSetId: testSetId.trim() });
            toast.success(t("admin.dian_test_matrix_start_success"));
            setTestSetId("");
            await loadRuns();
            await viewRun(response.data.id);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setStarting(false);
        }
    };

    const cancelRun = async () => {
        if (!activeRun) return;
        try {
            setCancelling(true);
            await adminService.cancelDianTestMatrixRun(activeRun.id);
            toast.success(t("admin.dian_test_matrix_cancel_requested"));
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setCancelling(false);
        }
    };

    const documentColumns = [
        { title: t("admin.dian_test_matrix_col_sequence"), dataIndex: "sequence", key: "sequence", width: 50 },
        {
            title: t("admin.dian_test_matrix_col_type"),
            dataIndex: "documentType",
            key: "documentType",
            render: (value) => <Tag>{DOCUMENT_TYPE_LABEL[value] || value}</Tag>,
        },
        { title: t("admin.dian_test_matrix_col_reference"), dataIndex: "internalReference", key: "internalReference", render: (v) => <span className="font-mono text-xs">{v}</span> },
        { title: t("admin.dian_test_matrix_col_external_id"), dataIndex: "externalId", key: "externalId", render: (v) => v || "—" },
        {
            title: t("admin.dian_test_matrix_col_status"),
            dataIndex: "status",
            key: "status",
            render: (value) => <Tag color={DOC_STATUS_COLOR[value] || "default"}>{t(`admin.dian_test_matrix_doc_status_${value}`)}</Tag>,
        },
        { title: t("admin.dian_test_matrix_col_cufe"), dataIndex: "cufe", key: "cufe", render: (v) => (v ? <span className="font-mono text-xs">{`${v.slice(0, 10)}…`}</span> : "—") },
        {
            title: t("admin.dian_test_matrix_col_certificate"),
            dataIndex: "certificateProvider",
            key: "certificateProvider",
            render: (v, r) => (v ? <Tag color="cyan">{getCertificateLabel(v, r.certificateIdentifier)}</Tag> : "—"),
        },
        { title: t("admin.dian_test_matrix_col_description"), key: "description", render: (_, r) => r.errorMessage || r.statusDescription || "—" },
        { title: t("admin.dian_test_matrix_col_attempts"), dataIndex: "attempts", key: "attempts", width: 70 },
        { title: t("admin.dian_test_matrix_col_sent_at"), dataIndex: "sentAt", key: "sentAt", render: (v) => (v ? new Date(v).toLocaleTimeString() : "—") },
        { title: t("admin.dian_test_matrix_col_resolved_at"), dataIndex: "resolvedAt", key: "resolvedAt", render: (v) => (v ? new Date(v).toLocaleTimeString() : "—") },
    ];

    const historyColumns = [
        { title: t("admin.dian_test_matrix_company_label"), key: "company", render: (_, r) => companyNameById(r.companyId) },
        { title: "Test Set ID", dataIndex: "testSetId", key: "testSetId", render: (v) => <span className="font-mono text-xs">{v}</span> },
        {
            title: t("admin.dian_test_matrix_col_status"),
            dataIndex: "status",
            key: "status",
            render: (value, r) => (
                <Tag color={RUN_STATUS_COLOR[value] || "default"}>
                    {t(`admin.dian_test_matrix_status_${value}`)}
                    {value === "completed" && r.passResult !== null ? (r.passResult ? " ✓" : " ✗") : ""}
                </Tag>
            ),
        },
        { title: t("fiscal_setup.start_date"), dataIndex: "createdAt", key: "createdAt", render: (v) => new Date(v).toLocaleString() },
        {
            title: "",
            key: "actions",
            render: (_, r) => <Button size="small" onClick={() => viewRun(r.id)}>{t("admin.dian_test_matrix_view")}</Button>,
        },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title={t("admin.dian_test_matrix_title")}
                subtitle={t("admin.dian_test_matrix_subtitle")}
                icon={<ExperimentOutlined />}
            />

            <Alert
                className="dark-alert dark-alert-purple"
                type="info"
                showIcon
                message={t("admin.dian_test_matrix_hint_title")}
                description={t("admin.dian_test_matrix_hint")}
            />

            <div className="module-shell rounded-3xl p-4 sm:p-5 space-y-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[2fr_2fr_auto]">
                    <div>
                        <label className="mb-1 block text-sm font-medium">{t("admin.dian_test_matrix_company_label")}</label>
                        <Select
                            className="w-full"
                            size="large"
                            showSearch
                            optionFilterProp="label"
                            placeholder={t("admin.dian_test_matrix_company_placeholder")}
                            value={companyId}
                            onChange={setCompanyId}
                            options={companies.map((c) => ({ value: c.id, label: c.name }))}
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-sm font-medium">{t("admin.dian_test_matrix_testset_label")}</label>
                        <input
                            className="auth-ohnix-input ant-input ant-input-lg w-full"
                            value={testSetId}
                            onChange={(e) => setTestSetId(e.target.value)}
                            placeholder={t("admin.dian_test_matrix_testset_placeholder")}
                        />
                    </div>
                    <div className="flex items-end">
                        <Button
                            type="primary"
                            size="large"
                            loading={starting}
                            disabled={!companyId || !testSetId.trim() || Boolean(activeCompanyRun)}
                            onClick={startRun}
                        >
                            {t("admin.dian_test_matrix_start_button")}
                        </Button>
                    </div>
                </div>
                {activeCompanyRun && (
                    <Alert type="warning" showIcon className="dark-alert dark-alert-amber" message={t("admin.dian_test_matrix_already_running")} />
                )}
            </div>

            {activeRun && (
                <div className="module-shell rounded-3xl p-4 sm:p-5 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                            <Tag color={RUN_STATUS_COLOR[activeRun.status] || "default"} className="text-sm">
                                {t(`admin.dian_test_matrix_status_${activeRun.status}`)}
                            </Tag>
                            {activeRun.status === "completed" && (
                                <Tag color={activeRun.passResult ? "green" : "red"}>
                                    {activeRun.passResult ? t("admin.dian_test_matrix_pass_label") : t("admin.dian_test_matrix_fail_label")}
                                </Tag>
                            )}
                            {runCertificate(activeRun) && (
                                <Tag color="cyan">
                                    {t("fiscal_setup.habilitacion_run_certificate_label")}: {getCertificateLabel(runCertificate(activeRun).certificateProvider, runCertificate(activeRun).certificateIdentifier)}
                                </Tag>
                            )}
                        </div>
                        <div className="flex gap-2">
                            {["pending", "running"].includes(activeRun.status) && (
                                <Popconfirm title={t("admin.dian_test_matrix_cancel_confirm")} onConfirm={cancelRun}>
                                    <Button danger icon={<StopOutlined />} loading={cancelling}>{t("admin.dian_test_matrix_cancel_button")}</Button>
                                </Popconfirm>
                            )}
                            <Button icon={<ReloadOutlined />} onClick={() => viewRun(activeRun.id)}>{t("admin.dian_test_matrix_refresh")}</Button>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                        {["invoice", "creditNote", "debitNote"].map((type) => {
                            const counts = activeRun.summary?.[type] || {};
                            const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
                            const target = type === "invoice" ? activeRun.invoiceTarget : type === "creditNote" ? activeRun.creditNoteTarget : activeRun.debitNoteTarget;
                            return (
                                <Statistic
                                    key={type}
                                    title={t(`admin.dian_test_matrix_summary_${type === "invoice" ? "invoices" : type === "creditNote" ? "credit_notes" : "debit_notes"}`)}
                                    value={`${total}/${target}`}
                                    suffix={counts.accepted ? `· ${counts.accepted} ✓` : undefined}
                                />
                            );
                        })}
                    </div>

                    <Table
                        className="module-dark-table"
                        rowKey="id"
                        columns={documentColumns}
                        dataSource={activeRun.documents || []}
                        pagination={false}
                        scroll={{ x: true, y: 480 }}
                        size="small"
                        locale={{ emptyText: <Empty description={t("admin.dian_test_matrix_documents_empty")} /> }}
                    />
                </div>
            )}

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <h3 className="m-0 text-base font-semibold">{t("admin.dian_test_matrix_history_title")}</h3>
                    <div className="flex flex-1 flex-wrap justify-end gap-2">
                        <Input
                            allowClear
                            prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                            placeholder={t("admin.dian_test_matrix_search_placeholder")}
                            value={historySearch}
                            onChange={(e) => setHistorySearch(e.target.value)}
                            className="max-w-xs"
                        />
                        <Select
                            allowClear
                            placeholder={t("admin.dian_test_matrix_filter_status_placeholder")}
                            className="min-w-48"
                            value={historyStatusFilter}
                            onChange={setHistoryStatusFilter}
                            options={Object.keys(RUN_STATUS_COLOR).map((status) => ({ value: status, label: t(`admin.dian_test_matrix_status_${status}`) }))}
                        />
                        <Button icon={<ReloadOutlined />} loading={loadingRuns} onClick={loadRuns}>{t("admin.dian_test_matrix_refresh")}</Button>
                    </div>
                </div>
                <Table
                    className="module-dark-table"
                    rowKey="id"
                    columns={historyColumns}
                    dataSource={filteredRuns}
                    loading={loadingRuns}
                    pagination={{ pageSize: 10 }}
                    locale={{ emptyText: <Empty description={historySearch || historyStatusFilter ? t("admin.dian_test_matrix_no_matches") : t("admin.dian_test_matrix_history_empty")} /> }}
                    scroll={{ x: true }}
                />
            </div>
        </div>
    );
};

export default AdminDianTestMatrix;
