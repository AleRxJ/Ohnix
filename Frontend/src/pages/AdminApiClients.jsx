// Frontend/src/pages/AdminApiClients.jsx
//
// Admin-only provisioning of "external API clients" - companies with NO
// Ohnix account/Company row (their own POS/ERP/SaaS) that want to integrate
// directly against itcycle-api-dian's DIAN e-invoicing engine via API,
// bypassing Ohnix's own app entirely. Today this only exists as raw
// curl/Postman calls against itcycle-api-dian's admin API - this page is the
// first Ohnix admin UI for it. See Backend/services/externalApiClient.service.js.
import { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Form, Input, Modal, Select, Table, Tooltip } from "antd";
import { BarChartOutlined, CloudServerOutlined, CopyOutlined, CreditCardOutlined, KeyOutlined, MailOutlined, PlusOutlined, RocketOutlined, SafetyCertificateOutlined, SearchOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { adminService } from "../services/adminService";
import PageHeader from "../components/common/PageHeader";

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid var(--ohnix-line-4)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
    },
    header: {
        background: "transparent",
        borderBottom: "1px solid var(--ohnix-line-3)",
        padding: "20px 24px 16px",
    },
    body: { padding: 24 },
};

const AdminApiClients = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [loading, setLoading] = useState(true);
    const [clients, setClients] = useState([]);
    const [search, setSearch] = useState("");

    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [createForm] = Form.useForm();

    // Issue-key modal: null when closed, otherwise the ExternalApiClient row
    // the admin is generating a key for. issuedKey holds the raw key ONCE it
    // comes back from the backend - closing the modal (any way) discards it
    // for good, there is no "show again".
    const [keyModalClient, setKeyModalClient] = useState(null);
    const [issuing, setIssuing] = useState(false);
    const [issuedKey, setIssuedKey] = useState(null);
    const [keyLabel, setKeyLabel] = useState("");

    // Live cross-check against itcycle-api-dian's own records (see
    // adminService.listExternalApiClientLiveKeys) - separate from the
    // Ohnix-side issuance log the "apiKeys" column already shows, so the
    // admin can tell "what we think we issued" apart from "what
    // itcycle-api-dian actually has on file" for this client.
    const [liveKeysClient, setLiveKeysClient] = useState(null);
    const [liveKeysLoading, setLiveKeysLoading] = useState(false);
    const [liveKeys, setLiveKeys] = useState(null);
    const [liveKeysError, setLiveKeysError] = useState("");

    // Billable-usage modal (current calendar month, ACCEPTED documents only)
    // - see adminService.getExternalApiClientUsage. Same
    // open/loading/error/close shape as the live-keys modal above, so an
    // admin can see real numbers before sending a manual invoice against the
    // published per-document pricing.
    const [usageClient, setUsageClient] = useState(null);
    const [usageLoading, setUsageLoading] = useState(false);
    const [usage, setUsage] = useState(null);
    const [usageError, setUsageError] = useState("");

    // Automatic recurring billing modal - shows enrollment status, lets the
    // admin generate a single-use card-enrollment link (one-time reveal,
    // same "no show again" rule as the issue-key modal above - see
    // Backend/services/externalApiClient.service.js#createBillingEnrollmentLink),
    // and lists past charges (ExternalApiClientCharge rows).
    const [billingClient, setBillingClient] = useState(null);
    const [billingHistoryLoading, setBillingHistoryLoading] = useState(false);
    const [billingHistory, setBillingHistory] = useState(null);
    const [billingHistoryError, setBillingHistoryError] = useState("");
    const [generatingLink, setGeneratingLink] = useState(false);
    const [enrollmentLink, setEnrollmentLink] = useState(null);

    // Occasional cross-sell email modal - a client with no Ohnix account at
    // all (see this file's own top comment) only has their contactEmail as a
    // channel, so this is just a free-text note + send button, admin-decided
    // every time rather than any kind of automated campaign.
    const [upsellClient, setUpsellClient] = useState(null);
    const [upsellNote, setUpsellNote] = useState("");
    const [sendingUpsell, setSendingUpsell] = useState(false);

    const fetchData = async () => {
        try {
            setLoading(true);
            const response = await adminService.listExternalApiClients();
            setClients(response?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const filteredClients = useMemo(() => {
        const needle = search.trim().toLowerCase();
        if (!needle) return clients;
        return clients.filter((client) =>
            [client.companyName, client.taxIdentification, client.contactEmail, client.contactName]
                .filter(Boolean)
                .some((field) => field.toLowerCase().includes(needle))
        );
    }, [clients, search]);

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.only_admin")} />
            </div>
        );
    }

    const openCreateModal = () => {
        createForm.resetFields();
        setCreateModalOpen(true);
    };

    const closeCreateModal = () => {
        setCreateModalOpen(false);
        createForm.resetFields();
    };

    const handleCreateSubmit = async (values) => {
        try {
            setCreating(true);
            await adminService.createExternalApiClient(values);
            toast.success(t("admin.api_clients_create_success"));
            closeCreateModal();
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setCreating(false);
        }
    };

    const openKeyModal = (client) => {
        setKeyModalClient(client);
        setIssuedKey(null);
        setKeyLabel("");
    };

    // No "show again" on close, by design - see this file's own header
    // comment and the model's ExternalApiClientKeyIssuance doc comment.
    const closeKeyModal = () => {
        setKeyModalClient(null);
        setIssuedKey(null);
        setKeyLabel("");
    };

    const handleGenerateKey = async () => {
        if (!keyModalClient) return;
        try {
            setIssuing(true);
            const response = await adminService.issueExternalApiClientApiKey(keyModalClient.id, keyLabel.trim() || undefined);
            setIssuedKey(response?.data?.apiKey || "");
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setIssuing(false);
        }
    };

    const copyIssuedKey = async () => {
        if (!issuedKey) return;
        try {
            await navigator.clipboard.writeText(issuedKey);
            toast.success(t("admin.api_clients_issue_key_copied"));
        } catch {
            // Clipboard API can be unavailable (permissions, insecure context) - the value is still visible in the field.
        }
    };

    const openLiveKeysModal = async (client) => {
        setLiveKeysClient(client);
        setLiveKeys(null);
        setLiveKeysError("");
        setLiveKeysLoading(true);
        try {
            const response = await adminService.listExternalApiClientLiveKeys(client.id);
            setLiveKeys(response?.data || []);
        } catch (error) {
            setLiveKeysError(error.response?.data?.message || t("common.error"));
        } finally {
            setLiveKeysLoading(false);
        }
    };

    const closeLiveKeysModal = () => {
        setLiveKeysClient(null);
        setLiveKeys(null);
        setLiveKeysError("");
    };

    const openUsageModal = async (client) => {
        setUsageClient(client);
        setUsage(null);
        setUsageError("");
        setUsageLoading(true);
        try {
            const response = await adminService.getExternalApiClientUsage(client.id);
            setUsage(response?.data || null);
        } catch (error) {
            setUsageError(error.response?.data?.message || t("common.error"));
        } finally {
            setUsageLoading(false);
        }
    };

    const closeUsageModal = () => {
        setUsageClient(null);
        setUsage(null);
        setUsageError("");
    };

    const openBillingModal = async (client) => {
        setBillingClient(client);
        setBillingHistory(null);
        setBillingHistoryError("");
        setEnrollmentLink(null);
        setBillingHistoryLoading(true);
        try {
            const response = await adminService.getExternalApiClientBillingHistory(client.id);
            setBillingHistory(response?.data || []);
        } catch (error) {
            setBillingHistoryError(error.response?.data?.message || t("common.error"));
        } finally {
            setBillingHistoryLoading(false);
        }
    };

    const closeBillingModal = () => {
        setBillingClient(null);
        setBillingHistory(null);
        setBillingHistoryError("");
        setEnrollmentLink(null);
    };

    const handleGenerateEnrollmentLink = async () => {
        if (!billingClient) return;
        try {
            setGeneratingLink(true);
            const response = await adminService.createExternalApiClientBillingEnrollmentLink(billingClient.id);
            setEnrollmentLink(response?.data?.enrollmentUrl || "");
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setGeneratingLink(false);
        }
    };

    const openUpsellModal = (client) => {
        setUpsellClient(client);
        setUpsellNote("");
    };

    const closeUpsellModal = () => {
        setUpsellClient(null);
        setUpsellNote("");
    };

    const handleSendUpsell = async () => {
        if (!upsellClient) return;
        try {
            setSendingUpsell(true);
            await adminService.sendExternalApiClientUpsellEmail(upsellClient.id, upsellNote.trim() || undefined);
            toast.success(t("admin.api_clients_upsell_sent"));
            closeUpsellModal();
            fetchData();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setSendingUpsell(false);
        }
    };

    const copyEnrollmentLink = async () => {
        if (!enrollmentLink) return;
        try {
            await navigator.clipboard.writeText(enrollmentLink);
            toast.success(t("admin.api_clients_issue_key_copied"));
        } catch {
            // Clipboard API can be unavailable - the value is still visible in the field.
        }
    };

    const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "—");

    const columns = [
        {
            title: t("admin.api_clients_col_company"),
            dataIndex: "companyName",
            key: "companyName",
            render: (_, record) => (
                <div>
                    <div className="text-[var(--ohnix-text-primary)]">{record.companyName}</div>
                    <div className="text-xs text-[var(--ohnix-text-muted)]">
                        {[record.taxIdentification, record.taxIdentificationDv].filter(Boolean).join("-") || "—"}
                    </div>
                </div>
            ),
        },
        {
            title: t("admin.api_clients_col_contact"),
            key: "contact",
            render: (_, record) => (
                <div>
                    <div className="text-[var(--ohnix-text-primary)]">{record.contactName || "—"}</div>
                    <div className="text-xs text-[var(--ohnix-text-muted)]">{record.contactEmail || "—"}</div>
                </div>
            ),
        },
        {
            title: t("admin.api_clients_col_api_keys"),
            key: "apiKeys",
            render: (_, record) => {
                const issuances = record.apiKeyIssuances || [];
                if (issuances.length === 0) {
                    return <span className="text-[var(--ohnix-text-dim)]">{t("admin.api_clients_keys_issued_none")}</span>;
                }
                return (
                    <div>
                        <div>{t("admin.api_clients_keys_issued_count", { count: issuances.length })}</div>
                        <div className="text-xs text-[var(--ohnix-text-muted)]">
                            {t("admin.api_clients_last_issued", { date: formatDate(issuances[0]?.issuedAt) })}
                        </div>
                    </div>
                );
            },
        },
        {
            title: t("admin.api_clients_col_created"),
            dataIndex: "createdAt",
            key: "createdAt",
            render: (value) => formatDate(value),
        },
        {
            title: t("common.actions"),
            key: "actions",
            fixed: "right",
            render: (_, record) => (
                <div className="flex flex-wrap gap-2">
                    <Button type="text" size="small" icon={<KeyOutlined />} onClick={() => openKeyModal(record)}>
                        {t("admin.api_clients_issue_key_button")}
                    </Button>
                    <Button
                        type="text"
                        size="small"
                        icon={<SafetyCertificateOutlined />}
                        onClick={() => openLiveKeysModal(record)}
                    >
                        {t("admin.api_clients_verify_button")}
                    </Button>
                    <Button
                        type="text"
                        size="small"
                        icon={<BarChartOutlined />}
                        onClick={() => openUsageModal(record)}
                    >
                        {t("admin.api_clients_usage_button")}
                    </Button>
                    <Button
                        type="text"
                        size="small"
                        icon={<CreditCardOutlined />}
                        onClick={() => openBillingModal(record)}
                    >
                        {t("admin.api_clients_billing_button")}
                    </Button>
                    <Button
                        type="text"
                        size="small"
                        icon={<RocketOutlined />}
                        onClick={() => openUpsellModal(record)}
                        disabled={!record.contactEmail}
                    >
                        {t("admin.api_clients_upsell_button")}
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title={t("admin.api_clients_title")}
                subtitle={t("admin.api_clients_subtitle")}
                icon={<CloudServerOutlined />}
                onActionClick={openCreateModal}
                actionIcon={<PlusOutlined />}
                actionText={t("admin.api_clients_new_button")}
            />

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <Input
                        allowClear
                        prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                        placeholder={t("admin.api_clients_search_placeholder")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-xs"
                    />
                </div>

                <Table
                    className="module-dark-table"
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredClients}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{
                        emptyText: (
                            <Empty description={search ? t("admin.api_clients_no_matches") : t("admin.api_clients_empty")} />
                        ),
                    }}
                    scroll={{ x: true }}
                />
            </div>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <CloudServerOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("admin.api_clients_create_modal_title")}
                        </span>
                    </div>
                }
                open={createModalOpen}
                onCancel={closeCreateModal}
                onOk={() => createForm.submit()}
                confirmLoading={creating}
                okText={t("common.save")}
                cancelText={t("common.cancel")}
                okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
                cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
                destroyOnClose
                width={640}
                styles={darkModalStyles}
            >
                <Form form={createForm} layout="vertical" onFinish={handleCreateSubmit} className="mt-2">
                    <Form.Item
                        name="companyName"
                        label={t("admin.api_clients_field_company_name")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Form.Item
                            name="taxIdentification"
                            label={t("admin.api_clients_field_tax_identification")}
                            rules={[{ required: true, message: t("validation.required_field") }]}
                        >
                            <Input size="large" className="auth-ohnix-input" placeholder="900123456" />
                        </Form.Item>
                        <Form.Item
                            name="taxIdentificationDv"
                            label={t("admin.api_clients_field_tax_identification_dv")}
                            rules={[{ required: true, message: t("validation.required_field") }]}
                        >
                            <Input size="large" className="auth-ohnix-input" placeholder="7" />
                        </Form.Item>
                    </div>
                    <Form.Item
                        name="personType"
                        label={t("admin.api_clients_field_person_type")}
                        initialValue="1"
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Select
                            size="large"
                            className="auth-ohnix-input"
                            options={[
                                { value: "1", label: t("admin.api_clients_person_type_legal") },
                                { value: "2", label: t("admin.api_clients_person_type_natural") },
                            ]}
                        />
                    </Form.Item>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Form.Item name="contactName" label={t("admin.api_clients_field_contact_name")}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                        <Form.Item name="contactEmail" label={t("admin.api_clients_field_contact_email")}>
                            <Input type="email" size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </div>
                    <Form.Item name="contactPhone" label={t("admin.api_clients_field_contact_phone")}>
                        <Input size="large" className="auth-ohnix-input" />
                    </Form.Item>
                    <Form.Item name="notes" label={t("admin.api_clients_field_notes")}>
                        <Input.TextArea rows={3} className="auth-ohnix-input" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <KeyOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("admin.api_clients_issue_key_modal_title")}
                        </span>
                    </div>
                }
                open={Boolean(keyModalClient)}
                onCancel={closeKeyModal}
                footer={<Button onClick={closeKeyModal}>{t("admin.api_clients_issue_key_close")}</Button>}
                destroyOnClose
                width={560}
                styles={darkModalStyles}
            >
                {keyModalClient && !issuedKey && (
                    <div className="mt-2 space-y-4">
                        <p className="text-sm text-[var(--ohnix-text-muted)]">
                            {t("admin.api_clients_issue_key_intro", { name: keyModalClient.companyName })}
                        </p>
                        <Form layout="vertical">
                            <Form.Item label={t("admin.api_clients_issue_key_label_field")} className="mb-2">
                                <Input
                                    size="large"
                                    className="auth-ohnix-input"
                                    value={keyLabel}
                                    onChange={(e) => setKeyLabel(e.target.value)}
                                    placeholder={t("admin.api_clients_issue_key_label_placeholder")}
                                />
                            </Form.Item>
                        </Form>
                        <Button
                            type="primary"
                            size="large"
                            block
                            loading={issuing}
                            onClick={handleGenerateKey}
                            className="h-11 rounded-md font-medium"
                        >
                            {issuing ? t("admin.api_clients_issue_key_generating") : t("admin.api_clients_issue_key_generate_button")}
                        </Button>
                    </div>
                )}

                {issuedKey !== null && (
                    <div className="mt-2 space-y-4">
                        <Alert
                            className="dark-alert dark-alert-amber"
                            type="warning"
                            showIcon
                            message={t("admin.api_clients_issue_key_warning_title")}
                            description={t("admin.api_clients_issue_key_warning_description")}
                        />
                        <Input.Group compact className="flex">
                            <Input readOnly value={issuedKey} className="auth-ohnix-input font-mono" />
                            <Tooltip title={t("admin.api_clients_issue_key_copy")}>
                                <Button icon={<CopyOutlined />} onClick={copyIssuedKey} className="h-10" />
                            </Tooltip>
                        </Input.Group>
                    </div>
                )}
            </Modal>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <SafetyCertificateOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("admin.api_clients_verify_modal_title")}
                        </span>
                    </div>
                }
                open={Boolean(liveKeysClient)}
                onCancel={closeLiveKeysModal}
                footer={<Button onClick={closeLiveKeysModal}>{t("admin.api_clients_issue_key_close")}</Button>}
                destroyOnClose
                width={560}
                styles={darkModalStyles}
            >
                {liveKeysClient && (
                    <div className="mt-2 space-y-4">
                        <p className="text-sm text-[var(--ohnix-text-muted)]">
                            {t("admin.api_clients_verify_intro", { name: liveKeysClient.companyName })}
                        </p>
                        {liveKeysLoading && (
                            <p className="text-sm text-[var(--ohnix-text-muted)]">{t("admin.api_clients_verify_loading")}</p>
                        )}
                        {!liveKeysLoading && liveKeysError && (
                            <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={liveKeysError} />
                        )}
                        {!liveKeysLoading && !liveKeysError && liveKeys && liveKeys.length === 0 && (
                            <Empty description={t("admin.api_clients_verify_empty")} />
                        )}
                        {!liveKeysLoading && !liveKeysError && liveKeys && liveKeys.length > 0 && (
                            <div className="space-y-2">
                                {liveKeys.map((key) => (
                                    <div
                                        key={key.id}
                                        className="flex items-center justify-between rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] px-4 py-3"
                                    >
                                        <div>
                                            <div className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                                {key.label || "—"}
                                            </div>
                                            <div className="text-xs text-[var(--ohnix-text-muted)]">
                                                {key.keyPrefix}••••••• · {formatDate(key.createdAt)}
                                            </div>
                                        </div>
                                        <span className="text-xs uppercase tracking-wide text-[var(--ohnix-text-muted)]">
                                            {key.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <BarChartOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("admin.api_clients_usage_modal_title")}
                        </span>
                    </div>
                }
                open={Boolean(usageClient)}
                onCancel={closeUsageModal}
                footer={<Button onClick={closeUsageModal}>{t("admin.api_clients_issue_key_close")}</Button>}
                destroyOnClose
                width={560}
                styles={darkModalStyles}
            >
                {usageClient && (
                    <div className="mt-2 space-y-4">
                        {usageLoading && (
                            <p className="text-sm text-[var(--ohnix-text-muted)]">{t("admin.api_clients_usage_loading")}</p>
                        )}
                        {!usageLoading && usageError && (
                            <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={usageError} />
                        )}
                        {!usageLoading && !usageError && usage && (
                            <div className="space-y-3">
                                <p className="text-sm text-[var(--ohnix-text-muted)]">
                                    {t("admin.api_clients_usage_intro", {
                                        name: usageClient.companyName,
                                        month: usage.month,
                                        year: usage.year,
                                    })}
                                </p>
                                <div className="space-y-2">
                                    {[
                                        { label: t("admin.api_clients_usage_row_invoices"), value: usage.invoices },
                                        { label: t("admin.api_clients_usage_row_credit_notes"), value: usage.creditNotes },
                                        { label: t("admin.api_clients_usage_row_debit_notes"), value: usage.debitNotes },
                                        { label: t("admin.api_clients_usage_row_support_documents"), value: usage.supportDocuments },
                                    ].map((row) => (
                                        <div
                                            key={row.label}
                                            className="flex items-center justify-between rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] px-4 py-3"
                                        >
                                            <span className="text-sm text-[var(--ohnix-text-primary)]">{row.label}</span>
                                            <span className="text-sm font-medium text-[var(--ohnix-text-primary)]">{row.value}</span>
                                        </div>
                                    ))}
                                    <div className="flex items-center justify-between rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] px-4 py-3">
                                        <span className="text-sm font-semibold text-[var(--ohnix-text-primary)]">
                                            {t("admin.api_clients_usage_row_total")}
                                        </span>
                                        <span className="text-sm font-semibold text-[#44F3F0]">{usage.total}</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <CreditCardOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("admin.api_clients_billing_modal_title")}
                        </span>
                    </div>
                }
                open={Boolean(billingClient)}
                onCancel={closeBillingModal}
                footer={<Button onClick={closeBillingModal}>{t("admin.api_clients_issue_key_close")}</Button>}
                destroyOnClose
                width={640}
                styles={darkModalStyles}
            >
                {billingClient && (
                    <div className="mt-2 space-y-5">
                        {billingClient.billingAtRisk && (
                            <Alert
                                className="dark-alert dark-alert-amber"
                                type="warning"
                                showIcon
                                message={t("admin.api_clients_billing_at_risk")}
                            />
                        )}

                        <div>
                            <p className="text-sm text-[var(--ohnix-text-muted)] mb-2">
                                {billingClient.epaycoCustomerId
                                    ? t("admin.api_clients_billing_enrolled", { date: formatDate(billingClient.billingEnrolledAt) })
                                    : t("admin.api_clients_billing_not_enrolled")}
                            </p>

                            {!enrollmentLink && (
                                <Button
                                    type="primary"
                                    loading={generatingLink}
                                    onClick={handleGenerateEnrollmentLink}
                                    className="h-10 rounded-md font-medium"
                                >
                                    {billingClient.epaycoCustomerId
                                        ? t("admin.api_clients_billing_regenerate_link_button")
                                        : t("admin.api_clients_billing_generate_link_button")}
                                </Button>
                            )}

                            {enrollmentLink && (
                                <div className="space-y-2">
                                    <Alert
                                        className="dark-alert dark-alert-amber"
                                        type="warning"
                                        showIcon
                                        message={t("admin.api_clients_issue_key_warning_title")}
                                        description={t("admin.api_clients_billing_link_warning_description")}
                                    />
                                    <Input.Group compact className="flex">
                                        <Input readOnly value={enrollmentLink} className="auth-ohnix-input font-mono" />
                                        <Tooltip title={t("admin.api_clients_issue_key_copy")}>
                                            <Button icon={<CopyOutlined />} onClick={copyEnrollmentLink} className="h-10" />
                                        </Tooltip>
                                    </Input.Group>
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-sm font-medium text-[var(--ohnix-text-primary)] mb-2">
                                {t("admin.api_clients_billing_history_title")}
                            </p>
                            {billingHistoryLoading && (
                                <p className="text-sm text-[var(--ohnix-text-muted)]">{t("admin.api_clients_usage_loading")}</p>
                            )}
                            {!billingHistoryLoading && billingHistoryError && (
                                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={billingHistoryError} />
                            )}
                            {!billingHistoryLoading && !billingHistoryError && billingHistory && billingHistory.length === 0 && (
                                <Empty description={t("admin.api_clients_billing_history_empty")} />
                            )}
                            {!billingHistoryLoading && !billingHistoryError && billingHistory && billingHistory.length > 0 && (
                                <div className="space-y-2 max-h-72 overflow-y-auto">
                                    {billingHistory.map((charge) => (
                                        <div
                                            key={charge.id}
                                            className="flex items-center justify-between rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] px-4 py-3"
                                        >
                                            <div>
                                                <div className="text-sm font-medium text-[var(--ohnix-text-primary)]">
                                                    {charge.chargeType === "annual_base"
                                                        ? t("admin.api_clients_billing_charge_type_annual")
                                                        : t("admin.api_clients_billing_charge_type_overage", {
                                                            docs: charge.documentsCharged,
                                                        })}
                                                </div>
                                                <div className="text-xs text-[var(--ohnix-text-muted)]">
                                                    {charge.periodMonth ? `${charge.periodMonth}/${charge.periodYear}` : charge.periodYear}
                                                    {" · "}
                                                    {formatDate(charge.chargedAt)}
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">
                                                    ${Number(charge.amountCop).toLocaleString("es-CO")}
                                                </div>
                                                <span
                                                    className={`text-xs uppercase tracking-wide ${
                                                        charge.status === "success" ? "text-emerald-400" : "text-red-400"
                                                    }`}
                                                >
                                                    {charge.status === "success"
                                                        ? t("admin.api_clients_billing_status_success")
                                                        : t("admin.api_clients_billing_status_failed")}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </Modal>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <RocketOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("admin.api_clients_upsell_modal_title")}
                        </span>
                    </div>
                }
                open={Boolean(upsellClient)}
                onCancel={closeUpsellModal}
                onOk={handleSendUpsell}
                confirmLoading={sendingUpsell}
                okText={t("admin.api_clients_upsell_send_button")}
                cancelText={t("common.cancel")}
                okButtonProps={{ className: "h-10 px-6 rounded-md font-medium", icon: <MailOutlined /> }}
                cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
                destroyOnClose
                width={560}
                styles={darkModalStyles}
            >
                {upsellClient && (
                    <div className="mt-2 space-y-4">
                        <p className="text-sm text-[var(--ohnix-text-muted)]">
                            {t("admin.api_clients_upsell_intro", { name: upsellClient.companyName, email: upsellClient.contactEmail })}
                        </p>
                        {upsellClient.upsellEmailSentAt && (
                            <Alert
                                className="dark-alert dark-alert-purple"
                                type="info"
                                showIcon
                                message={t("admin.api_clients_upsell_last_sent", { date: formatDate(upsellClient.upsellEmailSentAt) })}
                            />
                        )}
                        <Form layout="vertical">
                            <Form.Item label={t("admin.api_clients_upsell_note_label")} className="mb-0">
                                <Input.TextArea
                                    rows={3}
                                    className="auth-ohnix-input"
                                    value={upsellNote}
                                    onChange={(e) => setUpsellNote(e.target.value)}
                                    placeholder={t("admin.api_clients_upsell_note_placeholder")}
                                />
                            </Form.Item>
                        </Form>
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default AdminApiClients;
