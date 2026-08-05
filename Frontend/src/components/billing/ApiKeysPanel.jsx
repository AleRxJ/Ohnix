import React, { useEffect, useState } from "react";
import { Button, Modal, Form, Input, List, Tag, Tooltip, Popconfirm, Typography } from "antd";
import { KeyOutlined, PlusOutlined, CopyOutlined, DeleteOutlined, LockOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import useSubscription from "../../hooks/useSubscription";
import useI18n from "../../hooks/useI18n";
import { apiKeyService } from "../../services/apiKeyService";

const { Text, Paragraph } = Typography;

const MAX_ACTIVE_KEYS = 5;

const ApiKeysPanel = () => {
    const { can, loading: subscriptionLoading } = useSubscription();
    const { t } = useI18n();
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form] = Form.useForm();
    const [newKey, setNewKey] = useState(null);

    const canUseApi = can("apiAccess");
    const activeKeyCount = keys.filter((key) => !key.revoked_at).length;

    const fetchKeys = async () => {
        try {
            setLoading(true);
            const response = await apiKeyService.listApiKeys();
            setKeys(response?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (canUseApi) fetchKeys();
    }, [canUseApi]);

    const handleCreate = async ({ name }) => {
        try {
            setCreating(true);
            const response = await apiKeyService.createApiKey(name);
            setNewKey({ key: response?.data?.key, name });
            form.resetFields();
            setCreateOpen(false);
            await fetchKeys();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setCreating(false);
        }
    };

    const handleRevoke = async (id) => {
        try {
            await apiKeyService.revokeApiKey(id);
            toast.success(t("billing.api_keys.revoked"));
            await fetchKeys();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const copyKey = async (key) => {
        if (!key) return;
        try {
            await navigator.clipboard.writeText(key);
            toast.success(t("billing.api_keys.copied"));
        } catch {
            toast.error(t("common.error"));
        }
    };

    if (subscriptionLoading) return null;

    return (
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-white">
                        <KeyOutlined className="text-[#44F3F0]" />
                        {t("billing.api_keys.title")}
                    </div>
                    <p className="mt-1 text-xs text-[#A9B3B8]">{t("billing.api_keys.hint")}</p>
                </div>
                {canUseApi ? (
                    <Tooltip
                        title={
                            activeKeyCount >= MAX_ACTIVE_KEYS
                                ? t("billing.api_keys.max_reached_tooltip", { count: MAX_ACTIVE_KEYS })
                                : undefined
                        }
                    >
                        <span>
                            <Button
                                icon={<PlusOutlined />}
                                onClick={() => setCreateOpen(true)}
                                disabled={activeKeyCount >= MAX_ACTIVE_KEYS}
                                className="bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0] border-0 w-full sm:w-auto"
                            >
                                {t("billing.api_keys.create")}
                            </Button>
                        </span>
                    </Tooltip>
                ) : (
                    <Tooltip title={t("billing.api_keys.locked_tooltip")}>
                        <span>
                            <Button disabled icon={<LockOutlined />} className="w-full sm:w-auto">
                                {t("billing.api_keys.create")}
                            </Button>
                        </span>
                    </Tooltip>
                )}
            </div>

            {canUseApi && (
                <List
                    className="mt-4"
                    loading={loading}
                    dataSource={keys}
                    locale={{ emptyText: t("billing.api_keys.empty") }}
                    renderItem={(item) => (
                        <List.Item
                            className="!border-white/10"
                            actions={[
                                item.revoked_at ? (
                                    <Tag key="revoked" color="default">
                                        {t("billing.api_keys.revoked_tag")}
                                    </Tag>
                                ) : (
                                    <Popconfirm
                                        key="revoke"
                                        title={t("billing.api_keys.confirm_revoke_title")}
                                        description={t("billing.api_keys.confirm_revoke_description")}
                                        onConfirm={() => handleRevoke(item.id)}
                                        okText={t("common.yes")}
                                        cancelText={t("common.no")}
                                    >
                                        <Button danger size="small" icon={<DeleteOutlined />}>
                                            {t("billing.api_keys.revoke")}
                                        </Button>
                                    </Popconfirm>
                                ),
                            ]}
                        >
                            <List.Item.Meta
                                title={<span className="text-white">{item.name}</span>}
                                description={
                                    <span className="text-xs text-[#A9B3B8]">
                                        {item.key_prefix}••••••••
                                        {" · "}
                                        {t("billing.api_keys.requests_today", { count: item.requests_today })}
                                        {item.last_used_at
                                            ? ` · ${t("billing.api_keys.last_used", {
                                                  date: new Date(item.last_used_at).toLocaleDateString(),
                                              })}`
                                            : ` · ${t("billing.api_keys.never_used")}`}
                                    </span>
                                }
                            />
                        </List.Item>
                    )}
                />
            )}

            <Modal
                title={t("billing.api_keys.create_modal_title")}
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={creating}
                okText={t("common.add")}
                cancelText={t("common.cancel")}
                destroyOnClose
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item
                        name="name"
                        label={t("billing.api_keys.name_label")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input placeholder={t("billing.api_keys.name_placeholder")} maxLength={60} />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={t("billing.api_keys.reveal_modal_title")}
                open={!!newKey}
                onCancel={() => setNewKey(null)}
                footer={[
                    <Button key="close" type="primary" onClick={() => setNewKey(null)}>
                        {t("billing.api_keys.reveal_done")}
                    </Button>,
                ]}
                destroyOnClose
            >
                <Paragraph className="text-[#A9B3B8]">{t("billing.api_keys.reveal_warning")}</Paragraph>
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-3">
                    <Text code className="flex-1 break-all text-[#44F3F0]">
                        {newKey?.key}
                    </Text>
                    <Button icon={<CopyOutlined />} onClick={() => copyKey(newKey?.key)} />
                </div>
            </Modal>
        </div>
    );
};

export default ApiKeysPanel;
