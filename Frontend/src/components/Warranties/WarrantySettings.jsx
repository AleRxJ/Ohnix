import { useEffect, useState } from "react";
import { Drawer, Checkbox, InputNumber, Table, Switch, Input, Button, Spin, Tooltip, Card, Collapse, Tag, Space } from "antd";
import { InfoCircleOutlined, ClockCircleOutlined, BellOutlined, FileTextOutlined, TagsOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { TextArea } = Input;

const ALL_STATUSES = [
    "registered",
    "received",
    "in_review",
    "approved",
    "rejected",
    "in_repair",
    "waiting_part",
    "ready",
    "delivered",
    "closed",
];

// Only these generate a customer-facing message by default (spec section 6's
// checklist) - "in_review"/"waiting_part" stay internal-only unless the
// merchant sends a manual update.
const NOTIFIABLE_EVENTS = ["registered", "received", "approved", "rejected", "in_repair", "ready", "closed"];

// Mirrors Backend/utils/warrantyTemplateRenderer.js#WARRANTY_TEMPLATE_VARIABLES
// - kept here (rather than imported) since this is purely display copy for
// the settings UI, not logic shared with the backend.
const TEMPLATE_VARIABLES = [
    "cliente_nombre",
    "empresa_nombre",
    "producto_nombre",
    "garantia_id",
    "fecha_compra",
    "fecha_vencimiento",
    "numero_factura",
    "estado_garantia",
    "empresa_telefono",
    "empresa_direccion",
];

const SectionCard = ({ icon, title, children, hint }) => (
    <Card className="mb-4 shadow-sm border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]" bodyStyle={{ padding: 20 }}>
        <div className="flex items-center gap-2 mb-3">
            <div className="w-1 h-5 bg-gradient-to-b from-[#29D8D5] to-[#44F3F0] rounded-full" />
            <span className="text-[#44F3F0]">{icon}</span>
            <span className="font-semibold text-[var(--ohnix-text-primary)]">{title}</span>
        </div>
        {children}
        {hint && <p className="text-xs text-[var(--ohnix-text-muted)] mt-2 mb-0">{hint}</p>}
    </Card>
);

// Configuración → Garantías → Notificaciones (spec section 8). No generic
// Settings section exists elsewhere in Ohnix to nest under, so this lives as
// an in-module drawer opened from the Warranties list, gated to "admin"
// level (see warranty.routes.js).
const WarrantySettings = ({ open, onClose, settings, loading, saving, onSave }) => {
    const { t } = useI18n();
    const [enabledStatuses, setEnabledStatuses] = useState(ALL_STATUSES);
    const [defaultDuration, setDefaultDuration] = useState(30);
    const [templates, setTemplates] = useState({});

    useEffect(() => {
        if (!settings) return;
        setEnabledStatuses(settings.enabled_statuses?.length ? settings.enabled_statuses : ALL_STATUSES);
        setDefaultDuration(settings.default_warranty_duration_days || 30);
        const byKey = {};
        for (const template of settings.templates || []) {
            byKey[`${template.event}:${template.channel}`] = template;
        }
        setTemplates(byKey);
    }, [settings]);

    const getTemplate = (event, channel) => templates[`${event}:${channel}`] || { is_enabled: true, subject: "", body_template: "" };

    const updateTemplate = (event, channel, patch) => {
        setTemplates((prev) => ({
            ...prev,
            [`${event}:${channel}`]: { ...getTemplate(event, channel), event, channel, ...patch },
        }));
    };

    const handleSave = () => {
        onSave({
            enabled_statuses: enabledStatuses,
            default_warranty_duration_days: defaultDuration,
            templates: Object.values(templates),
        });
    };

    const columns = [
        { title: t("warranties.settings_col_event"), key: "event", render: (_, row) => t(`warranties.status_${row.event}`) },
        {
            title: (
                <span className="inline-flex items-center gap-1">
                    {t("warranties.channel_whatsapp")}
                    <Tooltip title={t("warranties.whatsapp_not_configured_hint")}>
                        <InfoCircleOutlined className="text-[var(--ohnix-text-muted)]" />
                    </Tooltip>
                </span>
            ),
            key: "whatsapp",
            render: (_, row) => (
                <Switch
                    checked={getTemplate(row.event, "whatsapp").is_enabled}
                    onChange={(checked) => updateTemplate(row.event, "whatsapp", { is_enabled: checked })}
                />
            ),
        },
        {
            title: t("warranties.channel_email"),
            key: "email",
            render: (_, row) => (
                <Switch
                    checked={getTemplate(row.event, "email").is_enabled}
                    onChange={(checked) => updateTemplate(row.event, "email", { is_enabled: checked })}
                />
            ),
        },
    ];

    const collapseItems = NOTIFIABLE_EVENTS.map((event) => ({
        key: event,
        label: (
            <span className="inline-flex items-center gap-2">
                <Tag color="cyan">{t(`warranties.status_${event}`)}</Tag>
                <span className="text-[var(--ohnix-text-muted)] text-xs">{t("warranties.channel_email")}</span>
            </span>
        ),
        children: (
            <Space direction="vertical" size="small" className="w-full">
                <Input
                    placeholder={t("warranties.template_subject_placeholder")}
                    value={getTemplate(event, "email").subject}
                    onChange={(e) => updateTemplate(event, "email", { subject: e.target.value })}
                />
                <TextArea
                    rows={3}
                    placeholder={t("warranties.template_body_placeholder")}
                    value={getTemplate(event, "email").body_template}
                    onChange={(e) => updateTemplate(event, "email", { body_template: e.target.value })}
                />
            </Space>
        ),
    }));

    return (
        <Drawer title={t("warranties.settings_title")} open={open} onClose={onClose} width={640}>
            {loading ? (
                <div className="text-center py-10">
                    <Spin />
                </div>
            ) : (
                <>
                    <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">{t("warranties.settings_intro")}</p>

                    <SectionCard icon={<TagsOutlined />} title={t("warranties.settings_enabled_statuses")} hint={t("warranties.settings_enabled_statuses_hint")}>
                        <Checkbox.Group
                            className="grid grid-cols-2 gap-2"
                            value={enabledStatuses}
                            onChange={setEnabledStatuses}
                            options={ALL_STATUSES.map((s) => ({ label: t(`warranties.status_${s}`), value: s }))}
                        />
                    </SectionCard>

                    <SectionCard icon={<ClockCircleOutlined />} title={t("warranties.settings_default_duration")}>
                        <InputNumber min={1} value={defaultDuration} onChange={setDefaultDuration} className="w-full" addonAfter={t("warranties.days")} />
                    </SectionCard>

                    <SectionCard icon={<BellOutlined />} title={t("warranties.settings_notifications_title")}>
                        <Table
                            className="module-dark-table"
                            rowKey="event"
                            size="small"
                            pagination={false}
                            columns={columns}
                            dataSource={NOTIFIABLE_EVENTS.map((event) => ({ event }))}
                        />
                    </SectionCard>

                    <SectionCard icon={<TagsOutlined />} title={t("warranties.settings_variables_title")} hint={t("warranties.settings_variables_hint")}>
                        <div className="flex flex-wrap gap-2">
                            {TEMPLATE_VARIABLES.map((key) => (
                                <Tooltip key={key} title={t(`warranties.var_${key}`)}>
                                    <Tag className="cursor-help font-mono">{`{{${key}}}`}</Tag>
                                </Tooltip>
                            ))}
                        </div>
                    </SectionCard>

                    <SectionCard icon={<FileTextOutlined />} title={t("warranties.settings_templates_title")} hint={t("warranties.settings_templates_hint")}>
                        <Collapse items={collapseItems} accordion className="module-dark-table" />
                    </SectionCard>

                    <div className="flex justify-end gap-2 mt-4">
                        <Button onClick={onClose}>{t("common.cancel")}</Button>
                        <Button type="primary" loading={saving} onClick={handleSave}>
                            {t("common.save")}
                        </Button>
                    </div>
                </>
            )}
        </Drawer>
    );
};

export default WarrantySettings;
