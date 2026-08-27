import { useEffect, useState } from "react";
import { Button, Modal, Form, Input, List, Tag, Tooltip, Popconfirm, Select, Table } from "antd";
import { ApiOutlined, PlusOutlined, DeleteOutlined, LockOutlined, SyncOutlined, HistoryOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import useSubscription from "../../hooks/useSubscription";
import useI18n from "../../hooks/useI18n";
import { integrationService } from "../../services/integrationService";

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid var(--ohnix-line-4)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
    },
    header: { background: "transparent", borderBottom: "1px solid var(--ohnix-line-3)", padding: "20px 24px 16px" },
    body: { padding: 24 },
};

const STATUS_COLOR = { connected: "green", error: "red", disconnected: "default" };

const IntegrationsPanel = () => {
    const { can, loading: subscriptionLoading } = useSubscription();
    const { t } = useI18n();
    const [connections, setConnections] = useState([]);
    const [loading, setLoading] = useState(false);
    const [connectOpen, setConnectOpen] = useState(false);
    const [connecting, setConnecting] = useState(false);
    const [testingId, setTestingId] = useState(null);
    const [logsTarget, setLogsTarget] = useState(null);
    const [logs, setLogs] = useState([]);
    const [form] = Form.useForm();

    const canUseIntegrations = can("apiAccess");

    const fetchConnections = async () => {
        try {
            setLoading(true);
            const response = await integrationService.list();
            setConnections(response?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canUseIntegrations) fetchConnections();
    }, [canUseIntegrations]);

    const handleConnect = async (values) => {
        try {
            setConnecting(true);
            const created = await integrationService.create({
                provider: "shopify",
                name: values.name,
                config: { shopDomain: values.shop_domain.trim() },
                credentials: { accessToken: values.access_token.trim(), webhookSecret: values.webhook_secret?.trim() },
            });
            toast.success(t("billing.integrations.created"));
            form.resetFields();
            setConnectOpen(false);
            await fetchConnections();
            // Immediately try activating the connection - most users expect
            // "conectar" to mean "test + register webhooks" in one step, not
            // two separate clicks.
            await handleTest(created?.data?._id);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setConnecting(false);
        }
    };

    const handleTest = async (id) => {
        try {
            setTestingId(id);
            const response = await integrationService.test(id);
            if (response?.data?.webhooks_registered === false) {
                toast.error(t("billing.integrations.webhooks_failed", { error: response.data.webhook_error }));
            } else {
                toast.success(t("billing.integrations.test_success"));
            }
            await fetchConnections();
        } catch (error) {
            toast.error(error.response?.data?.message || t("billing.integrations.test_failed"));
            await fetchConnections();
        } finally {
            setTestingId(null);
        }
    };

    const handleDisconnect = async (id) => {
        try {
            await integrationService.remove(id);
            toast.success(t("billing.integrations.disconnected"));
            await fetchConnections();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const openLogs = async (connection) => {
        setLogsTarget(connection);
        try {
            const response = await integrationService.getLogs(connection._id);
            setLogs(response?.data || []);
        } catch {
            setLogs([]);
        }
    };

    if (subscriptionLoading) return null;

    return (
        <div className="mt-6 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--ohnix-text-primary)]">
                        <ApiOutlined className="text-[#44F3F0]" />
                        {t("billing.integrations.title")}
                    </div>
                    <p className="mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("billing.integrations.hint")}</p>
                </div>
                {canUseIntegrations ? (
                    <Button
                        icon={<PlusOutlined />}
                        onClick={() => setConnectOpen(true)}
                        className="bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0] border-0 w-full sm:w-auto"
                    >
                        {t("billing.integrations.connect")}
                    </Button>
                ) : (
                    <Tooltip title={t("billing.integrations.locked_tooltip")}>
                        <span>
                            <Button disabled icon={<LockOutlined />} className="w-full sm:w-auto">
                                {t("billing.integrations.connect")}
                            </Button>
                        </span>
                    </Tooltip>
                )}
            </div>

            {canUseIntegrations && (
                <List
                    className="mt-4"
                    loading={loading}
                    dataSource={connections}
                    locale={{ emptyText: t("billing.integrations.empty") }}
                    renderItem={(item) => (
                        <List.Item
                            className="!border-[var(--ohnix-line-4)]"
                            actions={[
                                <Button
                                    key="test"
                                    size="small"
                                    icon={<SyncOutlined spin={testingId === item._id} />}
                                    onClick={() => handleTest(item._id)}
                                    loading={testingId === item._id}
                                >
                                    {t("billing.integrations.test")}
                                </Button>,
                                <Button key="logs" type="text" size="small" icon={<HistoryOutlined />} onClick={() => openLogs(item)}>
                                    {t("billing.integrations.view_logs")}
                                </Button>,
                                <Popconfirm
                                    key="disconnect"
                                    title={t("billing.integrations.confirm_disconnect_title")}
                                    description={t("billing.integrations.confirm_disconnect_description")}
                                    onConfirm={() => handleDisconnect(item._id)}
                                    okText={t("common.yes")}
                                    cancelText={t("common.no")}
                                >
                                    <Button danger size="small" icon={<DeleteOutlined />}>
                                        {t("billing.integrations.disconnect")}
                                    </Button>
                                </Popconfirm>,
                            ]}
                        >
                            <List.Item.Meta
                                title={
                                    <span className="flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                                        {item.name}
                                        <Tag color={STATUS_COLOR[item.status]}>{t(`billing.integrations.status_${item.status}`)}</Tag>
                                    </span>
                                }
                                description={
                                    <span className="text-xs text-[var(--ohnix-text-muted)]">
                                        {item.provider}
                                        {" · "}
                                        {item.last_synced_at
                                            ? t("billing.integrations.last_synced", { date: new Date(item.last_synced_at).toLocaleString() })
                                            : t("billing.integrations.never_synced")}
                                        {item.last_error ? ` · ${item.last_error}` : ""}
                                    </span>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <ApiOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">{t("billing.integrations.connect_modal_title")}</span>
                    </div>
                }
                open={connectOpen}
                onCancel={() => setConnectOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={connecting}
                okText={t("billing.integrations.connect")}
                cancelText={t("common.cancel")}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Form form={form} layout="vertical" onFinish={handleConnect} initialValues={{ provider: "shopify" }}>
                    <Form.Item name="provider" label={t("billing.integrations.provider_label")}>
                        <Select disabled options={[{ label: "Shopify", value: "shopify" }]} />
                    </Form.Item>
                    <Form.Item name="name" label={t("billing.integrations.name_label")} rules={[{ required: true, message: t("validation.required_field") }]}>
                        <Input className="auth-ohnix-input" placeholder={t("billing.integrations.name_placeholder")} maxLength={60} />
                    </Form.Item>
                    <Form.Item
                        name="shop_domain"
                        label={t("billing.integrations.shop_domain_label")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input className="auth-ohnix-input" placeholder={t("billing.integrations.shop_domain_placeholder")} />
                    </Form.Item>
                    <Form.Item
                        name="access_token"
                        label={t("billing.integrations.access_token_label")}
                        extra={t("billing.integrations.access_token_hint")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input.Password className="auth-ohnix-input" placeholder={t("billing.integrations.access_token_placeholder")} />
                    </Form.Item>
                    <Form.Item name="webhook_secret" label={t("billing.integrations.webhook_secret_label")}>
                        <Input.Password className="auth-ohnix-input" placeholder={t("billing.integrations.webhook_secret_placeholder")} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={t("billing.integrations.logs_modal_title")}
                open={!!logsTarget}
                onCancel={() => setLogsTarget(null)}
                footer={null}
                width={720}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Table
                    size="small"
                    rowKey="_id"
                    dataSource={logs}
                    locale={{ emptyText: t("billing.integrations.logs_empty") }}
                    pagination={{ pageSize: 10 }}
                    columns={[
                        { title: "Fecha", dataIndex: "created_at", render: (v) => new Date(v).toLocaleString() },
                        { title: "Dirección", dataIndex: "direction" },
                        { title: "Entidad", dataIndex: "entity_type" },
                        { title: "Acción", dataIndex: "action" },
                        { title: "Estado", dataIndex: "status", render: (v) => <Tag color={v === "success" ? "green" : "red"}>{v}</Tag> },
                        { title: "Error", dataIndex: "error_message" },
                    ]}
                />
            </Modal>
        </div>
    );
};

export default IntegrationsPanel;
