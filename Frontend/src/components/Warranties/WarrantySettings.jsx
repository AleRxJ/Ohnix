import { useEffect, useState } from "react";
import { Drawer, Checkbox, InputNumber, Table, Switch, Input, Button, Divider, Spin } from "antd";
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
            title: t("warranties.channel_whatsapp"),
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

    return (
        <Drawer title={t("warranties.settings_title")} open={open} onClose={onClose} width={640}>
            {loading ? (
                <Spin />
            ) : (
                <>
                    <Divider orientation="left" className="text-base font-semibold !mt-0">
                        {t("warranties.settings_enabled_statuses")}
                    </Divider>
                    <Checkbox.Group
                        className="mb-4 grid grid-cols-2 gap-2"
                        value={enabledStatuses}
                        onChange={setEnabledStatuses}
                        options={ALL_STATUSES.map((s) => ({ label: t(`warranties.status_${s}`), value: s }))}
                    />

                    <Divider orientation="left" className="text-base font-semibold">
                        {t("warranties.settings_default_duration")}
                    </Divider>
                    <InputNumber min={1} value={defaultDuration} onChange={setDefaultDuration} className="mb-6 w-full" addonAfter={t("warranties.days")} />

                    <Divider orientation="left" className="text-base font-semibold">
                        {t("warranties.settings_notifications_title")}
                    </Divider>
                    <Table
                        className="module-dark-table mb-4"
                        rowKey="event"
                        size="small"
                        pagination={false}
                        columns={columns}
                        dataSource={NOTIFIABLE_EVENTS.map((event) => ({ event }))}
                    />

                    <Divider orientation="left" className="text-base font-semibold">
                        {t("warranties.settings_templates_title")}
                    </Divider>
                    {NOTIFIABLE_EVENTS.map((event) => (
                        <div key={event} className="mb-4">
                            <p className="text-sm font-medium mb-1">{t(`warranties.status_${event}`)} — {t("warranties.channel_email")}</p>
                            <Input
                                placeholder={t("warranties.template_subject_placeholder")}
                                className="mb-2"
                                value={getTemplate(event, "email").subject}
                                onChange={(e) => updateTemplate(event, "email", { subject: e.target.value })}
                            />
                            <TextArea
                                rows={2}
                                placeholder={t("warranties.template_body_placeholder")}
                                value={getTemplate(event, "email").body_template}
                                onChange={(e) => updateTemplate(event, "email", { body_template: e.target.value })}
                            />
                        </div>
                    ))}

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
