import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, Popconfirm, Switch, Tag, Typography } from "antd";
import { ApiOutlined, CheckCircleFilled, DisconnectOutlined, LinkOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { paymentProviderService } from "../../services/paymentProviderService";

// Each company connects ITS OWN Bold account here - the money from the Caja's
// datáfono/QR charges goes straight to that merchant, and Bold's webhook
// (URL below, unique per company) is what confirms each charge in Ohnix.
// Keys are write-only: the API only ever returns a masked hint.
export default function BoldConnectionCard() {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canAdmin = hasPermission("finance", "admin");
    const [connection, setConnection] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [editing, setEditing] = useState(false);
    const [testResult, setTestResult] = useState(null);
    const [form] = Form.useForm();

    const load = async () => {
        setLoading(true);
        try {
            setConnection(await paymentProviderService.getConnection("bold"));
        } catch {
            setConnection(null);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load();
    }, []);

    const connected = connection?.status === "connected";

    const save = async (values) => {
        setSaving(true);
        try {
            const result = await paymentProviderService.saveConnection({
                link_api_key: values.link_api_key || undefined,
                terminal_api_key: values.terminal_api_key || undefined,
                secret_key: values.secret_key || undefined,
                user_email: values.user_email || undefined,
                sandbox: Boolean(values.sandbox),
            });
            setConnection(result.connection);
            setTestResult(result.test);
            if (result.test?.ok) {
                toast.success(t("bold.connected_toast"));
                setEditing(false);
                form.resetFields();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || t("bold.save_failed"));
        } finally {
            setSaving(false);
        }
    };

    const disconnect = async () => {
        try {
            setConnection(await paymentProviderService.disconnect());
            setTestResult(null);
            toast.success(t("bold.disconnected_toast"));
        } catch (error) {
            toast.error(error.response?.data?.message || t("bold.save_failed"));
        }
    };

    const showForm = canAdmin && (editing || !connection || connection.status === "disconnected");

    return (
        <section className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-6">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)]">
                        <ApiOutlined className="text-xl text-[var(--ohnix-accent-2)]" />
                    </div>
                    <div>
                        <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-[var(--ohnix-text-primary)]">
                            {t("bold.title")}
                            {!loading && connection && (
                                <Tag color={connected ? "success" : connection.status === "error" ? "error" : "default"}>
                                    {t(`bold.status_${connection.status}`)}
                                </Tag>
                            )}
                            {connection?.sandbox && <Tag color="warning">{t("bold.sandbox_tag")}</Tag>}
                        </h2>
                        <p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("bold.subtitle")}</p>
                    </div>
                </div>
                {canAdmin && connection && connection.status !== "disconnected" && !editing && (
                    <div className="flex gap-2">
                        <Button onClick={() => setEditing(true)}>{t("bold.edit_keys")}</Button>
                        <Popconfirm title={t("bold.disconnect_confirm")} onConfirm={disconnect} okText={t("bold.disconnect")} cancelText={t("common.cancel")}>
                            <Button danger icon={<DisconnectOutlined />}>
                                {t("bold.disconnect")}
                            </Button>
                        </Popconfirm>
                    </div>
                )}
            </div>

            {testResult && (
                <Alert
                    className="mb-4"
                    type={testResult.ok ? "success" : "error"}
                    showIcon
                    message={testResult.ok ? t("bold.test_ok") : t("bold.test_failed")}
                    description={testResult.detail}
                />
            )}
            {connection?.status === "error" && !testResult && connection.last_error && (
                <Alert className="mb-4" type="error" showIcon message={t("bold.test_failed")} description={connection.last_error} />
            )}

            {connection && connection.status !== "disconnected" && (
                <div className="mb-4 space-y-3">
                    <div className="flex flex-wrap gap-2 text-xs">
                        <Tag icon={connection.has_link_key ? <CheckCircleFilled /> : null} color={connection.has_link_key ? "cyan" : "default"}>
                            {t("bold.link_key")} {connection.link_key_hint || ""}
                        </Tag>
                        <Tag icon={connection.has_terminal_key ? <CheckCircleFilled /> : null} color={connection.has_terminal_key ? "cyan" : "default"}>
                            {t("bold.terminal_key")} {connection.terminal_key_hint || ""}
                        </Tag>
                        {connection.user_email && <Tag>{connection.user_email}</Tag>}
                    </div>
                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] p-3">
                        <div className="mb-1 flex items-center gap-2 text-sm font-semibold text-[var(--ohnix-text-primary)]">
                            <LinkOutlined /> {t("bold.webhook_title")}
                        </div>
                        {connection.webhook_url ? (
                            <Typography.Paragraph copyable={{ text: connection.webhook_url }} className="!mb-1 break-all font-mono text-xs text-[var(--ohnix-text-soft)]">
                                {connection.webhook_url}
                            </Typography.Paragraph>
                        ) : (
                            <p className="m-0 text-xs text-[var(--ohnix-status-amber)]">{t("bold.webhook_unavailable")}</p>
                        )}
                        <p className="m-0 text-xs text-[var(--ohnix-text-dim)]">{t("bold.webhook_help")}</p>
                    </div>
                </div>
            )}

            {!canAdmin && (!connection || connection.status === "disconnected") && (
                <Alert type="info" showIcon message={t("bold.ask_admin")} />
            )}

            {showForm && (
                <Form form={form} layout="vertical" onFinish={save} initialValues={{ sandbox: connection?.sandbox || false, user_email: connection?.user_email || "" }}>
                    <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("bold.help_title")} description={t("bold.help_desc")} />
                    <div className="grid grid-cols-1 gap-x-4 md:grid-cols-2">
                        <Form.Item name="link_api_key" label={t("bold.link_key")} extra={connection?.has_link_key ? t("bold.keep_blank") : t("bold.link_key_hint")}>
                            <Input.Password autoComplete="off" placeholder={connection?.link_key_hint || ""} />
                        </Form.Item>
                        <Form.Item name="terminal_api_key" label={t("bold.terminal_key")} extra={connection?.has_terminal_key ? t("bold.keep_blank") : t("bold.terminal_key_hint")}>
                            <Input.Password autoComplete="off" placeholder={connection?.terminal_key_hint || ""} />
                        </Form.Item>
                        <Form.Item name="secret_key" label={t("bold.secret_key")} extra={connection?.has_secret_key ? t("bold.keep_blank") : t("bold.secret_key_hint")}>
                            <Input.Password autoComplete="off" />
                        </Form.Item>
                        <Form.Item name="user_email" label={t("bold.user_email")} extra={t("bold.user_email_hint")} rules={[{ type: "email", message: t("validation.required_field") }]}>
                            <Input autoComplete="off" />
                        </Form.Item>
                    </div>
                    <Form.Item name="sandbox" valuePropName="checked" label={t("bold.sandbox")} extra={t("bold.sandbox_hint")}>
                        <Switch />
                    </Form.Item>
                    <div className="flex justify-end gap-2">
                        {editing && <Button onClick={() => setEditing(false)}>{t("common.cancel")}</Button>}
                        <Button type="primary" htmlType="submit" loading={saving}>
                            {t("bold.save_and_test")}
                        </Button>
                    </div>
                </Form>
            )}
        </section>
    );
}
