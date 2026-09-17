import { useEffect, useState } from "react";
import { Button, Modal, Form, Input, List, Tag, Tooltip, Popconfirm, Typography, Checkbox, Table, Switch } from "antd";
import { ThunderboltOutlined, PlusOutlined, DeleteOutlined, LockOutlined, HistoryOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import useSubscription from "../../hooks/useSubscription";
import useI18n from "../../hooks/useI18n";
import { webhookService } from "../../services/webhookService";

const { Text, Paragraph } = Typography;

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

const WebhooksPanel = () => {
    const { can, loading: subscriptionLoading } = useSubscription();
    const { t } = useI18n();
    const [endpoints, setEndpoints] = useState([]);
    const [availableEvents, setAvailableEvents] = useState([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [newSecret, setNewSecret] = useState(null);
    const [deliveriesTarget, setDeliveriesTarget] = useState(null);
    const [deliveries, setDeliveries] = useState([]);
    const [form] = Form.useForm();

    const canUseWebhooks = can("apiAccess");

    const eventOptions = availableEvents.map((event) => ({ label: event, value: event }));

    const fetchEndpoints = async () => {
        try {
            setLoading(true);
            const response = await webhookService.list();
            setEndpoints(response?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canUseWebhooks) {
            fetchEndpoints();
            webhookService
                .getAvailableEvents()
                .then((response) => setAvailableEvents(response?.data?.events || []))
                .catch(() => {});
        }
    }, [canUseWebhooks]);

    const handleCreate = async ({ url, events }) => {
        try {
            setCreating(true);
            const response = await webhookService.create({ url, events });
            setNewSecret(response?.data?.secret);
            form.resetFields();
            setCreateOpen(false);
            await fetchEndpoints();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setCreating(false);
        }
    };

    const handleToggleActive = async (item, isActive) => {
        try {
            await webhookService.update(item._id, { is_active: isActive });
            await fetchEndpoints();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const handleDelete = async (id) => {
        try {
            await webhookService.remove(id);
            toast.success(t("billing.webhooks.deleted"));
            await fetchEndpoints();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const openDeliveries = async (item) => {
        setDeliveriesTarget(item);
        try {
            const response = await webhookService.getDeliveries(item._id);
            setDeliveries(response?.data || []);
        } catch {
            setDeliveries([]);
        }
    };

    if (subscriptionLoading) return null;

    return (
        <div data-tour="integrations-webhooks" className="mt-6 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--ohnix-text-primary)]">
                        <ThunderboltOutlined className="text-[#44F3F0]" />
                        {t("billing.webhooks.title")}
                    </div>
                    <p className="mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("billing.webhooks.hint")}</p>
                </div>
                {canUseWebhooks ? (
                    <Button
                        icon={<PlusOutlined />}
                        onClick={() => setCreateOpen(true)}
                        className="bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0] border-0 w-full sm:w-auto"
                    >
                        {t("billing.webhooks.create")}
                    </Button>
                ) : (
                    <Tooltip title={t("billing.webhooks.locked_tooltip")}>
                        <span>
                            <Button disabled icon={<LockOutlined />} className="w-full sm:w-auto">
                                {t("billing.webhooks.create")}
                            </Button>
                        </span>
                    </Tooltip>
                )}
            </div>

            {canUseWebhooks && (
                <List
                    className="mt-4"
                    loading={loading}
                    dataSource={endpoints}
                    locale={{ emptyText: t("billing.webhooks.empty") }}
                    renderItem={(item) => (
                        <List.Item
                            className="!border-[var(--ohnix-line-4)]"
                            actions={[
                                <Switch key="active" checked={item.is_active} onChange={(checked) => handleToggleActive(item, checked)} size="small" />,
                                <Button key="deliveries" type="text" size="small" icon={<HistoryOutlined />} onClick={() => openDeliveries(item)}>
                                    {t("billing.webhooks.view_deliveries")}
                                </Button>,
                                <Popconfirm
                                    key="delete"
                                    title={t("billing.webhooks.confirm_delete_title")}
                                    onConfirm={() => handleDelete(item._id)}
                                    okText={t("common.yes")}
                                    cancelText={t("common.no")}
                                >
                                    <Button danger size="small" icon={<DeleteOutlined />} />
                                </Popconfirm>,
                            ]}
                        >
                            <List.Item.Meta
                                title={<span className="break-all text-[var(--ohnix-text-primary)]">{item.url}</span>}
                                description={
                                    <span className="flex flex-wrap gap-1 text-xs text-[var(--ohnix-text-muted)]">
                                        {item.events.map((ev) => (
                                            <Tag key={ev} color="cyan">{ev}</Tag>
                                        ))}
                                    </span>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}

            <Modal
                title={t("billing.webhooks.create_modal_title")}
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={creating}
                okText={t("common.add")}
                cancelText={t("common.cancel")}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item
                        name="url"
                        label={t("billing.webhooks.url_label")}
                        rules={[{ required: true, message: t("validation.required_field") }, { type: "url", message: t("billing.webhooks.url_invalid") }]}
                    >
                        <Input className="auth-ohnix-input" placeholder={t("billing.webhooks.url_placeholder")} />
                    </Form.Item>
                    <Form.Item
                        name="events"
                        label={t("billing.webhooks.events_label")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Checkbox.Group options={eventOptions} className="flex flex-col gap-2" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={t("billing.webhooks.reveal_modal_title")}
                open={!!newSecret}
                onCancel={() => setNewSecret(null)}
                footer={null}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Paragraph className="text-[var(--ohnix-text-muted)]">{t("billing.webhooks.reveal_warning")}</Paragraph>
                <div className="flex items-center gap-2 rounded-xl border border-[var(--ohnix-line-4)] bg-black/30 p-3">
                    <Text code className="flex-1 break-all text-[#44F3F0]">
                        {newSecret}
                    </Text>
                </div>
                <div className="flex justify-end pt-4 mt-4 border-t border-[var(--ohnix-line-4)]">
                    <Button
                        type="primary"
                        onClick={() => setNewSecret(null)}
                        className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                    >
                        {t("billing.api_keys.reveal_done")}
                    </Button>
                </div>
            </Modal>

            <Modal
                title={t("billing.webhooks.deliveries_modal_title")}
                open={!!deliveriesTarget}
                onCancel={() => setDeliveriesTarget(null)}
                footer={null}
                width={720}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Table
                    className="module-dark-table"
                    size="small"
                    rowKey="_id"
                    dataSource={deliveries}
                    locale={{ emptyText: t("billing.webhooks.deliveries_empty") }}
                    pagination={{ pageSize: 10 }}
                    columns={[
                        { title: "Fecha", dataIndex: "created_at", render: (v) => new Date(v).toLocaleString() },
                        { title: "Evento", dataIndex: "event_type" },
                        { title: "Intentos", dataIndex: "attempts" },
                        { title: "Estado", dataIndex: "status", render: (v) => <Tag color={v === "success" ? "green" : v === "failed" ? "red" : "gold"}>{v}</Tag> },
                        { title: "HTTP", dataIndex: "response_status" },
                        { title: "Error", dataIndex: "last_error" },
                    ]}
                />
            </Modal>
        </div>
    );
};

export default WebhooksPanel;
