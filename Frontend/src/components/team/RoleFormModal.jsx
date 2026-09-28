import React, { useEffect, useState } from "react";
import { Modal, Form, Input, Select, Switch, InputNumber } from "antd";
import { InfoCircleOutlined, TeamOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import usePermissionCatalog from "../../hooks/usePermissionCatalog";
import { ROLE_TEMPLATES } from "../../constants/roleTemplates";

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

// New roles start with no special grants - same deny-by-default as modules
// (Backend normalizeCapabilities treats a missing key as denied).
const EMPTY_CAPABILITIES = { salesPriceOverride: false, salesMaxDiscountPct: 0, catalogViewCosts: false };

// High-impact actions each module's "admin" level unlocks (backend routes
// that require "admin" - see the Fase 1 notes in payroll/finance/order/
// purchase/stockTransfer routes). Listed in the editor so the owner sees
// what a level really grants before saving. Labels: team.sensitive_<key>.
const SENSITIVE_ADMIN_ACTIONS = {
    orders: "orders_admin",
    purchases: "purchases_admin",
    products: "products_admin",
    finance: "finance_admin",
    accounting: "accounting_admin",
    payroll: "payroll_admin",
    warranties: "warranties_admin",
    pointsOfSale: "pointsOfSale_admin",
};

// sharedByCount: this role is edited IN PLACE and is shared by N other
// members - shown as a warning (RolesTab: editing a shared role template is
// the point of that screen, but it must not be a silent surprise).
// forkNotice: { count, targetName } - saving here will NOT touch the shared
// role; a fresh independent copy is created for targetName instead (see
// MembersTab's handleOpenPermissions). Informational, not a warning, since
// nothing shared actually changes.
const RoleFormModal = ({
    open,
    onCancel,
    onSubmit,
    submitting,
    form,
    editingRole,
    duplicatingRole = null,
    sharedByCount = 0,
    forkNotice = null,
}) => {
    const { t } = useI18n();
    const { moduleKeys, levels, dependencies } = usePermissionCatalog();
    // The discount cap only applies while free pricing is off.
    const priceOverride = Form.useWatch(["capabilities", "salesPriceOverride"], form);
    const watchedPermissions = Form.useWatch("permissions", form) || {};
    const watchedCapabilities = Form.useWatch("capabilities", form) || {};
    const sensitiveActions = [
        ...Object.entries(SENSITIVE_ADMIN_ACTIONS)
            .filter(([moduleKey]) => watchedPermissions[moduleKey] === "admin")
            .map(([, key]) => t(`team.sensitive_${key}`)),
        ...(watchedCapabilities.salesPriceOverride
            ? [t("team.sensitive_price_override")]
            : Number(watchedCapabilities.salesMaxDiscountPct) > 0
              ? [t("team.sensitive_discount", { pct: Number(watchedCapabilities.salesMaxDiscountPct) })]
              : []),
        ...(watchedCapabilities.catalogViewCosts ? [t("team.sensitive_view_costs")] : []),
        // Subscription routes top out at "edit" - admin grants nothing more.
        ...(["edit", "admin"].includes(watchedPermissions.billing) ? [t("team.sensitive_billing_edit")] : []),
    ];
    // Last automatic dependency raise, shown as a hint: { source, deps }.
    const [autoRaised, setAutoRaised] = useState(null);
    const isNewRole = !editingRole && !duplicatingRole && !forkNotice;

    // Granting a module that can't work without others (Backend
    // MODULE_DEPENDENCIES, e.g. orders needs customers + products) raises
    // those from "none" to "view". Advisory: the owner can lower them again.
    const handleValuesChange = (changed) => {
        const changedPermissions = changed?.permissions;
        if (!changedPermissions) return;
        for (const [moduleKey, level] of Object.entries(changedPermissions)) {
            if (level === "none") continue;
            const raised = (dependencies?.[moduleKey] || []).filter(
                (dep) => moduleKeys.includes(dep) && (form.getFieldValue(["permissions", dep]) || "none") === "none"
            );
            if (raised.length === 0) continue;
            form.setFieldsValue({ permissions: Object.fromEntries(raised.map((dep) => [dep, "view"])) });
            setAutoRaised({ source: moduleKey, deps: raised });
        }
    };

    const applyTemplate = (templateKey) => {
        const template = ROLE_TEMPLATES.find((tpl) => tpl.key === templateKey);
        if (!template) return;
        const permissions = {};
        for (const key of moduleKeys) permissions[key] = template.permissions[key] || "none";
        form.setFieldsValue({
            name: form.getFieldValue("name") || t(`team.template_${template.key}`),
            permissions,
            capabilities: { ...EMPTY_CAPABILITIES, ...template.capabilities },
        });
        setAutoRaised(null);
    };

    useEffect(() => {
        if (!open) return;
        setAutoRaised(null);
        const sourceRole = editingRole || duplicatingRole;
        if (sourceRole) {
            const permissions = {};
            for (const perm of sourceRole.permissions || []) {
                permissions[perm.moduleKey] = perm.level;
            }
            const name = duplicatingRole ? t("team.role_copy_suffix", { name: duplicatingRole.name }) : sourceRole.name;
            form.setFieldsValue({ name, permissions, capabilities: { ...EMPTY_CAPABILITIES, ...(sourceRole.capabilities || {}) } });
        } else {
            const permissions = {};
            for (const key of moduleKeys) permissions[key] = "none";
            form.setFieldsValue({ name: "", permissions, capabilities: EMPTY_CAPABILITIES });
        }
    }, [open, editingRole, duplicatingRole, form, t, moduleKeys]);

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <TeamOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {editingRole ? t("team.edit_role") : duplicatingRole ? t("team.duplicate_role") : t("team.add_role")}
                    </span>
                </div>
            }
            open={open}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
            cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
            destroyOnClose
            width={560}
            styles={darkModalStyles}
        >
            <Form form={form} layout="vertical" onFinish={onSubmit} onValuesChange={handleValuesChange} className="mt-2">
                {isNewRole && (
                    <div className="mb-4">
                        <div className="mb-1.5 text-xs text-[var(--ohnix-text-muted)]">{t("team.template_label")}</div>
                        <Select
                            size="large"
                            className="w-full"
                            placeholder={t("team.template_placeholder")}
                            onChange={applyTemplate}
                            options={ROLE_TEMPLATES.map((tpl) => ({ value: tpl.key, label: t(`team.template_${tpl.key}`) }))}
                        />
                    </div>
                )}

                <Form.Item
                    name="name"
                    label={t("team.role_name_label")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input size="large" className="auth-ohnix-input" placeholder={t("team.role_name_placeholder")} />
                </Form.Item>

                {forkNotice ? (
                    <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-3 py-2.5">
                        <TeamOutlined className="mt-0.5 text-[#44F3F0]" />
                        <p className="m-0 text-xs leading-relaxed text-[#CFE8E8]">
                            {t("team.fork_notice", { count: forkNotice.count, name: forkNotice.targetName })}
                        </p>
                    </div>
                ) : (
                    sharedByCount > 1 && (
                        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                            <TeamOutlined className="mt-0.5 text-[var(--ohnix-alert-amber-text)]" />
                            <p className="m-0 text-xs leading-relaxed text-[var(--ohnix-alert-amber-text)]">
                                {t("team.shared_role_warning", { count: sharedByCount })}
                            </p>
                        </div>
                    )
                )}

                <div className="mb-3 flex items-center gap-2 text-[11px] text-[var(--ohnix-text-dim)]">
                    <InfoCircleOutlined />
                    {t("team.dashboard_follows_reports_hint")}
                </div>

                {autoRaised && (
                    <div className="mb-3 flex items-start gap-2 rounded-xl border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-3 py-2 text-xs text-[var(--ohnix-text-primary)]">
                        <InfoCircleOutlined className="mt-0.5 text-[#44F3F0]" />
                        {t("team.dependencies_raised", {
                            module: t(`team.module_${autoRaised.source}`),
                            deps: autoRaised.deps.map((dep) => t(`team.module_${dep}`)).join(", "),
                        })}
                    </div>
                )}

                <div className="rounded-xl border border-[var(--ohnix-line-4)] divide-y divide-[var(--ohnix-line-4)] overflow-hidden">
                    {moduleKeys.map((moduleKey) => (
                        <div key={moduleKey} className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--ohnix-line-1)]">
                            <span className="text-sm text-[var(--ohnix-text-primary)]">{t(`team.module_${moduleKey}`)}</span>
                            <Form.Item name={["permissions", moduleKey]} className="m-0" initialValue="none">
                                <Select
                                    size="small"
                                    style={{ width: 130 }}
                                    options={levels.map((level) => ({
                                        value: level,
                                        label: t(`team.permission_${level}`),
                                    }))}
                                />
                            </Form.Item>
                        </div>
                    ))}
                </div>

                <div className="mt-5 mb-2 text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("team.capabilities_title")}</div>
                <div className="rounded-xl border border-[var(--ohnix-line-4)] divide-y divide-[var(--ohnix-line-4)] overflow-hidden">
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--ohnix-line-1)]">
                        <div className="min-w-0">
                            <div className="text-sm text-[var(--ohnix-text-primary)]">{t("team.capability_salesPriceOverride")}</div>
                            <div className="text-[11px] text-[var(--ohnix-text-dim)]">{t("team.capability_salesPriceOverride_hint")}</div>
                        </div>
                        <Form.Item name={["capabilities", "salesPriceOverride"]} valuePropName="checked" className="m-0" initialValue={false}>
                            <Switch size="small" />
                        </Form.Item>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--ohnix-line-1)]">
                        <div className="min-w-0">
                            <div className="text-sm text-[var(--ohnix-text-primary)]">{t("team.capability_salesMaxDiscountPct")}</div>
                            <div className="text-[11px] text-[var(--ohnix-text-dim)]">{t("team.capability_salesMaxDiscountPct_hint")}</div>
                        </div>
                        <Form.Item name={["capabilities", "salesMaxDiscountPct"]} className="m-0" initialValue={0}>
                            <InputNumber size="small" min={0} max={100} precision={2} addonAfter="%" style={{ width: 120 }} disabled={Boolean(priceOverride)} />
                        </Form.Item>
                    </div>
                    <div className="flex items-center justify-between gap-3 px-4 py-3 bg-[var(--ohnix-line-1)]">
                        <div className="min-w-0">
                            <div className="text-sm text-[var(--ohnix-text-primary)]">{t("team.capability_catalogViewCosts")}</div>
                            <div className="text-[11px] text-[var(--ohnix-text-dim)]">{t("team.capability_catalogViewCosts_hint")}</div>
                        </div>
                        <Form.Item name={["capabilities", "catalogViewCosts"]} valuePropName="checked" className="m-0" initialValue={false}>
                            <Switch size="small" />
                        </Form.Item>
                    </div>
                </div>

                <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
                    <div className="mb-1.5 text-xs font-semibold text-[var(--ohnix-alert-amber-text)]">{t("team.sensitive_title")}</div>
                    {sensitiveActions.length === 0 ? (
                        <p className="m-0 text-xs text-[var(--ohnix-text-muted)]">{t("team.sensitive_none")}</p>
                    ) : (
                        <ul className="m-0 pl-4 space-y-0.5 text-xs text-[var(--ohnix-text-primary)]">
                            {sensitiveActions.map((label) => (
                                <li key={label}>{label}</li>
                            ))}
                        </ul>
                    )}
                </div>
            </Form>
        </Modal>
    );
};

export default RoleFormModal;
