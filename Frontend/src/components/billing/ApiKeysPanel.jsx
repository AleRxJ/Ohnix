import { useEffect, useState } from "react";
import { Button, Modal, Form, Input, List, Tag, Tooltip, Popconfirm, Typography, Checkbox } from "antd";
import { KeyOutlined, PlusOutlined, CopyOutlined, DeleteOutlined, LockOutlined, SafetyOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import useSubscription from "../../hooks/useSubscription";
import useI18n from "../../hooks/useI18n";
import { apiKeyService } from "../../services/apiKeyService";

const { Text, Paragraph } = Typography;

const MAX_ACTIVE_KEYS = 5;

// antd's Tag color="default" is a fixed light-gray/near-black-text preset
// that doesn't adapt to Ohnix's own theme toggle (no ConfigProvider dark
// algorithm is configured), so any "neutral" tag needs explicit --ohnix-*
// styling instead - same fix applied in IntegrationsPanel/WebhooksPanel.
const NEUTRAL_TAG_STYLE = { background: "var(--ohnix-line-3)", color: "var(--ohnix-text-muted)", border: "1px solid var(--ohnix-line-4)" };

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

const ApiKeysPanel = () => {
    const { can, loading: subscriptionLoading } = useSubscription();
    const { t } = useI18n();
    const [keys, setKeys] = useState([]);
    const [loading, setLoading] = useState(false);
    const [createOpen, setCreateOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form] = Form.useForm();
    const [newKey, setNewKey] = useState(null);
    const [availableScopes, setAvailableScopes] = useState([]);
    const [scopesTarget, setScopesTarget] = useState(null);
    const [scopesForm] = Form.useForm();
    const [savingScopes, setSavingScopes] = useState(false);

    const canUseApi = can("apiAccess");
    const activeKeyCount = keys.filter((key) => !key.revoked_at).length;

    const scopeOptions = availableScopes.map((scope) => ({
        label: t(`billing.api_keys.scope_${scope.replace(":", "_")}`),
        value: scope,
    }));

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
        if (canUseApi) {
            fetchKeys();
            apiKeyService
                .getAvailableScopes()
                .then((response) => setAvailableScopes(response?.data?.scopes || []))
                .catch(() => {});
        }
    }, [canUseApi]);

    const handleCreate = async ({ name, scopes }) => {
        try {
            setCreating(true);
            const response = await apiKeyService.createApiKey(name, scopes?.length ? scopes : undefined);
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

    const openScopesEditor = (item) => {
        setScopesTarget(item);
        scopesForm.setFieldsValue({ scopes: item.scopes || [] });
    };

    const handleSaveScopes = async ({ scopes }) => {
        try {
            setSavingScopes(true);
            await apiKeyService.updateApiKeyScopes(scopesTarget.id, scopes || []);
            toast.success(t("billing.api_keys.scopes_updated"));
            setScopesTarget(null);
            await fetchKeys();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setSavingScopes(false);
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
        <div data-tour="integrations-api-keys" className="mt-6 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-2 text-sm font-bold text-[var(--ohnix-text-primary)]">
                        <KeyOutlined className="text-[#44F3F0]" />
                        {t("billing.api_keys.title")}
                    </div>
                    <p className="mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("billing.api_keys.hint")}</p>
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
                            className="!border-[var(--ohnix-line-4)]"
                            actions={[
                                !item.revoked_at && (
                                    <Button
                                        key="scopes"
                                        type="text"
                                        size="small"
                                        icon={<SafetyOutlined />}
                                        onClick={() => openScopesEditor(item)}
                                    >
                                        {t("billing.api_keys.edit_scopes")}
                                    </Button>
                                ),
                                item.revoked_at ? (
                                    <Tag key="revoked" style={NEUTRAL_TAG_STYLE}>
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
                                title={
                                    <span className="flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                                        {item.name}
                                        <Tag
                                            color={item.scopes?.length === scopeOptions.length ? "cyan" : undefined}
                                            style={item.scopes?.length === scopeOptions.length ? undefined : NEUTRAL_TAG_STYLE}
                                        >
                                            {item.scopes?.length === scopeOptions.length || !scopeOptions.length
                                                ? t("billing.api_keys.scopes_all_tag")
                                                : t("billing.api_keys.scopes_tag", { count: item.scopes?.length || 0 })}
                                        </Tag>
                                    </span>
                                }
                                description={
                                    <span className="text-xs text-[var(--ohnix-text-muted)]">
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
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <KeyOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("billing.api_keys.create_modal_title")}
                        </span>
                    </div>
                }
                open={createOpen}
                onCancel={() => setCreateOpen(false)}
                onOk={() => form.submit()}
                confirmLoading={creating}
                okText={t("common.add")}
                cancelText={t("common.cancel")}
                okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
                cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Form form={form} layout="vertical" onFinish={handleCreate}>
                    <Form.Item
                        name="name"
                        label={t("billing.api_keys.name_label")}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input className="auth-ohnix-input" placeholder={t("billing.api_keys.name_placeholder")} maxLength={60} />
                    </Form.Item>
                    <Form.Item name="scopes" label={t("billing.api_keys.scopes_label")} extra={t("billing.api_keys.scopes_hint")}>
                        <Checkbox.Group options={scopeOptions} className="flex flex-col gap-2" />
                    </Form.Item>
                </Form>
            </Modal>

            <Modal
                title={
                    <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                            <SafetyOutlined className="text-[#44F3F0]" />
                        </div>
                        <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                            {t("billing.api_keys.edit_scopes_modal_title")}
                        </span>
                    </div>
                }
                open={!!scopesTarget}
                onCancel={() => setScopesTarget(null)}
                onOk={() => scopesForm.submit()}
                confirmLoading={savingScopes}
                okText={t("common.save")}
                cancelText={t("common.cancel")}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Form form={scopesForm} layout="vertical" onFinish={handleSaveScopes}>
                    <Form.Item name="scopes" label={t("billing.api_keys.scopes_label")} extra={t("billing.api_keys.scopes_hint")}>
                        <Checkbox.Group options={scopeOptions} className="flex flex-col gap-2" />
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
                            {t("billing.api_keys.reveal_modal_title")}
                        </span>
                    </div>
                }
                open={!!newKey}
                onCancel={() => setNewKey(null)}
                footer={null}
                destroyOnClose
                styles={darkModalStyles}
            >
                <Paragraph className="text-[var(--ohnix-text-muted)]">{t("billing.api_keys.reveal_warning")}</Paragraph>
                <div className="flex items-center gap-2 rounded-xl border border-[var(--ohnix-line-4)] bg-black/30 p-3">
                    <Text code className="flex-1 break-all text-[#44F3F0]">
                        {newKey?.key}
                    </Text>
                    <Button icon={<CopyOutlined />} onClick={() => copyKey(newKey?.key)} />
                </div>
                <div className="flex justify-end pt-4 mt-4 border-t border-[var(--ohnix-line-4)]">
                    <Button
                        type="primary"
                        onClick={() => setNewKey(null)}
                        className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                    >
                        {t("billing.api_keys.reveal_done")}
                    </Button>
                </div>
            </Modal>
        </div>
    );
};

export default ApiKeysPanel;
