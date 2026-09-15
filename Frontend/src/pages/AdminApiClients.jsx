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
import { CloudServerOutlined, CopyOutlined, KeyOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
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
                <Button type="text" size="small" icon={<KeyOutlined />} onClick={() => openKeyModal(record)}>
                    {t("admin.api_clients_issue_key_button")}
                </Button>
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
        </div>
    );
};

export default AdminApiClients;
