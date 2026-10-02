import React, { useEffect, useMemo, useRef, useState } from "react";
import { Modal, Form, Input, Select, InputNumber, Slider, Dropdown } from "antd";
import {
    InfoCircleOutlined,
    TeamOutlined,
    DashboardOutlined,
    BarChartOutlined,
    RadarChartOutlined,
    ShoppingCartOutlined,
    UserOutlined,
    FileDoneOutlined,
    SafetyCertificateOutlined,
    AppstoreOutlined,
    TagsOutlined,
    ColumnWidthOutlined,
    SwapOutlined,
    ShoppingOutlined,
    ShopOutlined,
    FieldTimeOutlined,
    WalletOutlined,
    BookOutlined,
    IdcardOutlined,
    CreditCardOutlined,
    EnvironmentOutlined,
    DownOutlined,
    WarningOutlined,
    PercentageOutlined,
    EyeOutlined,
    DeleteOutlined,
    RollbackOutlined,
    ExportOutlined,
    DollarOutlined,
    ThunderboltOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import usePermissionCatalog from "../../hooks/usePermissionCatalog";
import { ROLE_TEMPLATES } from "../../constants/roleTemplates";
import { MODULE_GROUPS } from "../../constants/teamModules";
import PermissionLevelPicker from "./PermissionLevelPicker";
import { LEVEL_COLORS, tint } from "../../constants/permissionLevels";

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid var(--ohnix-line-4)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
        padding: 0,
    },
    header: { background: "transparent", borderBottom: "1px solid var(--ohnix-line-3)", padding: "20px 24px 16px", margin: 0 },
    // The body scrolls on its own so the header and the save/cancel footer
    // stay put while a long module list is edited.
    body: { padding: "20px 24px", maxHeight: "calc(100vh - 230px)", overflowY: "auto" },
    footer: { borderTop: "1px solid var(--ohnix-line-3)", padding: "14px 24px", margin: 0 },
};

// New roles start with no special grants - same deny-by-default as modules
// (Backend normalizeCapabilities treats a missing key as denied).
const EMPTY_CAPABILITIES = {
    salesPriceOverride: false,
    salesMaxDiscountPct: 0,
    catalogViewCosts: false,
    deleteRecords: false,
    processReturns: false,
    reportsExport: false,
    deferEinvoice: false,
    posCharge: false,
};

// On/off capabilities, each an icon card (the discount cap has its own
// slider card). Labels: team.capability_<key> / _hint.
const SWITCH_CAPABILITIES = [
    { key: "salesPriceOverride", icon: <DollarOutlined /> },
    { key: "catalogViewCosts", icon: <EyeOutlined /> },
    { key: "deleteRecords", icon: <DeleteOutlined /> },
    { key: "processReturns", icon: <RollbackOutlined /> },
    { key: "reportsExport", icon: <ExportOutlined /> },
    { key: "deferEinvoice", icon: <FieldTimeOutlined /> },
    { key: "posCharge", icon: <ShopOutlined /> },
];

const MODULE_ICONS = {
    dashboard: <DashboardOutlined />,
    reports: <BarChartOutlined />,
    discoveries: <RadarChartOutlined />,
    orders: <ShoppingCartOutlined />,
    customers: <UserOutlined />,
    einvoicing: <FileDoneOutlined />,
    warranties: <SafetyCertificateOutlined />,
    products: <AppstoreOutlined />,
    categories: <TagsOutlined />,
    units: <ColumnWidthOutlined />,
    inventory: <SwapOutlined />,
    purchases: <ShoppingOutlined />,
    suppliers: <ShopOutlined />,
    finance: <WalletOutlined />,
    accounting: <BookOutlined />,
    payroll: <IdcardOutlined />,
    billing: <CreditCardOutlined />,
    pointsOfSale: <EnvironmentOutlined />,
    team: <TeamOutlined />,
};

// High-impact actions each module's "admin" level unlocks (backend routes
// that require "admin" - see the Fase 1 notes in payroll/finance/order/
// purchase/stockTransfer routes). Listed in the editor so the owner sees
// what a level really grants before saving. Labels: team.sensitive_<key>.
const SENSITIVE_ADMIN_ACTIONS = {
    orders: "orders_admin",
    einvoicing: "einvoicing_admin",
    purchases: "purchases_admin",
    inventory: "inventory_admin",
    finance: "finance_admin",
    accounting: "accounting_admin",
    payroll: "payroll_admin",
    warranties: "warranties_admin",
    pointsOfSale: "pointsOfSale_admin",
    team: "team_admin",
};

// Whole-card toggle for one capability (Form.Item child: checked/onChange).
const CapabilityCard = ({ checked = false, onChange, icon, title, hint }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange?.(!checked)}
        className="group flex w-full items-start gap-3 rounded-2xl border px-3 py-2.5 text-left transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#29D8D5]"
        style={{
            borderColor: checked ? tint("#29D8D5", 45) : "var(--ohnix-line-4)",
            background: checked ? tint("#29D8D5", 9) : "var(--ohnix-line-1)",
        }}
    >
        <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm"
            style={{ color: checked ? "#44F3F0" : "var(--ohnix-text-dim)", background: checked ? tint("#29D8D5", 16) : "var(--ohnix-line-2)" }}
        >
            {icon}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-medium text-[var(--ohnix-text-primary)]">{title}</span>
            <span className="mt-0.5 block text-[11px] leading-snug text-[var(--ohnix-text-dim)]">{hint}</span>
        </span>
        {/* Visual-only switch: the whole card is the control (a real antd
            Switch is a <button>, which can't nest inside this one). */}
        <span
            aria-hidden="true"
            className="relative mt-1 inline-block h-4 w-7 shrink-0 rounded-full transition-colors duration-150"
            style={{ background: checked ? "#29D8D5" : "var(--ohnix-line-5)" }}
        >
            <span
                className="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-all duration-150"
                style={{ left: checked ? "14px" : "2px" }}
            />
        </span>
    </button>
);

// Slider + exact number for the discount cap (Form.Item child: value/onChange).
const DiscountControl = ({ value = 0, onChange, disabled }) => (
    <div className="mt-2 flex items-center gap-3">
        <Slider className="m-0 flex-1" min={0} max={100} step={1} value={Number(value) || 0} onChange={onChange} disabled={disabled} tooltip={{ formatter: (v) => `${v}%` }} />
        <InputNumber size="small" min={0} max={100} precision={0} value={value} onChange={(v) => onChange?.(v ?? 0)} disabled={disabled} addonAfter="%" style={{ width: 92 }} />
    </div>
);

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
    // Last automatic dependency raise, shown as a hint: { source, deps }.
    const [autoRaised, setAutoRaised] = useState(null);
    // Rows that just changed on their own (dependency raise) glow briefly so
    // the owner notices something moved besides what they clicked.
    const [flashKeys, setFlashKeys] = useState(() => new Set());
    const flashTimer = useRef(null);
    const isNewRole = !editingRole && !duplicatingRole && !forkNotice;

    // Catalog modules into the business-area groups; anything the backend
    // adds that isn't mapped yet lands in "other" instead of disappearing.
    const groups = useMemo(() => {
        const grouped = MODULE_GROUPS.map((group) => ({
            key: group.key,
            modules: group.modules.filter((key) => moduleKeys.includes(key)),
        })).filter((group) => group.modules.length > 0);
        const mapped = new Set(grouped.flatMap((group) => group.modules));
        const other = moduleKeys.filter((key) => !mapped.has(key));
        return other.length ? [...grouped, { key: "other", modules: other }] : grouped;
    }, [moduleKeys]);

    const levelCounts = { view: 0, edit: 0, admin: 0 };
    for (const key of moduleKeys) {
        const level = watchedPermissions[key];
        if (levelCounts[level] !== undefined) levelCounts[level] += 1;
    }
    const grantedCount = levelCounts.view + levelCounts.edit + levelCounts.admin;

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
        ...(watchedCapabilities.deleteRecords ? [t("team.sensitive_delete_records")] : []),
        ...(watchedCapabilities.processReturns ? [t("team.sensitive_process_returns")] : []),
        ...(watchedCapabilities.reportsExport ? [t("team.sensitive_reports_export")] : []),
        ...(watchedCapabilities.deferEinvoice ? [t("team.sensitive_defer_einvoice")] : []),
        ...(watchedCapabilities.posCharge ? [t("team.sensitive_pos_charge")] : []),
        // "team: admin" is already listed above; edit alone manages members.
        ...(watchedPermissions.team === "edit" ? [t("team.sensitive_team_edit")] : []),
        // Subscription routes top out at "edit" - admin grants nothing more.
        ...(["edit", "admin"].includes(watchedPermissions.billing) ? [t("team.sensitive_billing_edit")] : []),
    ];

    const flash = (keys) => {
        if (!keys.length) return;
        setFlashKeys(new Set(keys));
        clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setFlashKeys(new Set()), 1400);
    };
    useEffect(() => () => clearTimeout(flashTimer.current), []);

    // Granting a module that can't work without others (Backend
    // MODULE_DEPENDENCIES, e.g. orders needs customers + products) raises
    // those from "none" to "view". Advisory: the owner can lower them again.
    // Cascades: a module raised this way brings its own dependencies too
    // (orders -> products -> categories/units).
    const raiseDependencies = (changedPermissions) => {
        const allRaised = [];
        for (const [moduleKey, level] of Object.entries(changedPermissions || {})) {
            if (level === "none") continue;
            const raised = [];
            const queue = [moduleKey];
            while (queue.length) {
                const current = queue.shift();
                for (const dep of dependencies?.[current] || []) {
                    if (!moduleKeys.includes(dep) || raised.includes(dep)) continue;
                    if ((form.getFieldValue(["permissions", dep]) || "none") !== "none") continue;
                    raised.push(dep);
                    queue.push(dep);
                }
            }
            if (raised.length === 0) continue;
            form.setFieldsValue({ permissions: Object.fromEntries(raised.map((dep) => [dep, "view"])) });
            setAutoRaised({ source: moduleKey, deps: raised });
            allRaised.push(...raised);
        }
        flash(allRaised);
    };

    const handleValuesChange = (changed) => raiseDependencies(changed?.permissions);

    // setFieldsValue doesn't fire onValuesChange, so bulk changes run the
    // dependency pass themselves.
    const setGroupLevel = (modules, level) => {
        const permissions = Object.fromEntries(modules.map((key) => [key, level]));
        form.setFieldsValue({ permissions });
        raiseDependencies(permissions);
    };

    const clearAll = () => {
        form.setFieldsValue({ permissions: Object.fromEntries(moduleKeys.map((key) => [key, "none"])) });
        setAutoRaised(null);
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
        flash(Object.keys(template.permissions));
    };

    useEffect(() => {
        if (!open) return;
        setAutoRaised(null);
        setFlashKeys(new Set());
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

    const title = editingRole ? t("team.edit_role") : duplicatingRole ? t("team.duplicate_role") : t("team.add_role");

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#29D8D5]/30 bg-[#29D8D5]/10">
                        <TeamOutlined className="text-lg text-[#44F3F0]" />
                    </div>
                    <div className="min-w-0">
                        <div className="text-lg font-semibold leading-tight text-[var(--ohnix-text-primary)]">{title}</div>
                        <div className="text-xs font-normal text-[var(--ohnix-text-muted)]">{t("team.role_modal_subtitle")}</div>
                    </div>
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
            width={900}
            styles={darkModalStyles}
        >
            <Form form={form} layout="vertical" onFinish={onSubmit} onValuesChange={handleValuesChange} requiredMark={false}>
                {/* Identity: name + optional starting template side by side */}
                <div className={`grid gap-3 ${isNewRole ? "sm:grid-cols-2" : ""}`}>
                    <Form.Item
                        name="name"
                        label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("team.role_name_label")}</span>}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                        className="mb-0"
                    >
                        <Input size="large" className="auth-ohnix-input" placeholder={t("team.role_name_placeholder")} />
                    </Form.Item>
                    {isNewRole && (
                        // Same Form.Item label chrome as the name field so both
                        // controls sit on one line (no `name`: not submitted).
                        <Form.Item
                            label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("team.template_label")}</span>}
                            className="mb-0"
                        >
                            <Select
                                size="large"
                                className="w-full"
                                allowClear
                                placeholder={
                                    <span className="inline-flex items-center gap-2">
                                        <ThunderboltOutlined className="text-[#44F3F0]" />
                                        {t("team.template_placeholder")}
                                    </span>
                                }
                                onChange={applyTemplate}
                                options={ROLE_TEMPLATES.map((tpl) => ({ value: tpl.key, label: t(`team.template_${tpl.key}`) }))}
                            />
                        </Form.Item>
                    )}
                </div>

                {(forkNotice || sharedByCount > 1) && (
                    <div
                        className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 ${
                            forkNotice ? "border-[#29D8D5]/30 bg-[#29D8D5]/10" : "border-amber-500/30 bg-amber-500/10"
                        }`}
                    >
                        <TeamOutlined className={`mt-0.5 ${forkNotice ? "text-[#44F3F0]" : "text-[var(--ohnix-alert-amber-text)]"}`} />
                        <p className={`m-0 text-xs leading-relaxed ${forkNotice ? "text-[var(--ohnix-text-primary)]" : "text-[var(--ohnix-alert-amber-text)]"}`}>
                            {forkNotice
                                ? t("team.fork_notice", { count: forkNotice.count, name: forkNotice.targetName })
                                : t("team.shared_role_warning", { count: sharedByCount })}
                        </p>
                    </div>
                )}

                <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_290px]">
                    {/* Modules */}
                    <div className="min-w-0">
                        <div className="mb-3 flex flex-col gap-2">
                            <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-[var(--ohnix-text-primary)]">
                                    {t("team.modules_title")}
                                </span>
                                {grantedCount > 0 && (
                                    <button
                                        type="button"
                                        onClick={clearAll}
                                        className="rounded-md px-2 py-1 text-[11px] text-[var(--ohnix-text-muted)] transition-colors hover:bg-[var(--ohnix-hover-overlay)] hover:text-[var(--ohnix-text-primary)]"
                                    >
                                        {t("team.clear_all")}
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-2.5 py-0.5 text-[11px] text-[var(--ohnix-text-muted)] tabular-nums">
                                    {t("team.summary_modules", { count: grantedCount, total: moduleKeys.length })}
                                </span>
                                {["view", "edit", "admin"].map((level) =>
                                    levelCounts[level] > 0 ? (
                                        <span
                                            key={level}
                                            className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] tabular-nums"
                                            style={{ color: LEVEL_COLORS[level], background: tint(LEVEL_COLORS[level], 12) }}
                                        >
                                            <span className="h-1.5 w-1.5 rounded-full" style={{ background: LEVEL_COLORS[level] }} />
                                            {levelCounts[level]} {t(`team.permission_${level}`)}
                                        </span>
                                    ) : null
                                )}
                            </div>
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

                        <div className="flex flex-col gap-4">
                            {groups.map((group) => (
                                <section key={group.key} className="overflow-hidden rounded-2xl border border-[var(--ohnix-line-4)]">
                                    <div className="flex items-center justify-between gap-2 border-b border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] px-4 py-2">
                                        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--ohnix-text-muted)]">
                                            {t(`team.group_${group.key}`)}
                                        </span>
                                        <Dropdown
                                            trigger={["click"]}
                                            menu={{
                                                items: levels.map((level) => ({
                                                    key: level,
                                                    label: (
                                                        <span className="inline-flex items-center gap-2">
                                                            <span className="h-2 w-2 rounded-full" style={{ background: LEVEL_COLORS[level] }} />
                                                            {t(`team.permission_${level}`)}
                                                        </span>
                                                    ),
                                                })),
                                                onClick: ({ key }) => setGroupLevel(group.modules, key),
                                            }}
                                        >
                                            <button
                                                type="button"
                                                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] text-[var(--ohnix-text-muted)] transition-colors hover:bg-[var(--ohnix-hover-overlay)] hover:text-[var(--ohnix-text-primary)]"
                                            >
                                                {t("team.set_group_level")}
                                                <DownOutlined className="text-[9px]" />
                                            </button>
                                        </Dropdown>
                                    </div>
                                    <div className="divide-y divide-[var(--ohnix-line-3)]">
                                        {group.modules.map((moduleKey) => {
                                            const level = watchedPermissions[moduleKey] || "none";
                                            const color = LEVEL_COLORS[level];
                                            const flashing = flashKeys.has(moduleKey);
                                            return (
                                                <div
                                                    key={moduleKey}
                                                    className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 transition-colors duration-700"
                                                    style={{ background: flashing ? tint("#29D8D5", 12) : "var(--ohnix-line-1)" }}
                                                >
                                                    <span
                                                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[15px] transition-colors duration-200"
                                                        style={{
                                                            color: level === "none" ? "var(--ohnix-text-dim)" : color,
                                                            background: level === "none" ? "var(--ohnix-line-2)" : tint(color, 14),
                                                        }}
                                                    >
                                                        {MODULE_ICONS[moduleKey] || <AppstoreOutlined />}
                                                    </span>
                                                    <div className="min-w-[140px] flex-1">
                                                        <div className="text-[13px] font-medium text-[var(--ohnix-text-primary)]">
                                                            {t(`team.module_${moduleKey}`)}
                                                        </div>
                                                        <div className="text-[11px] leading-snug text-[var(--ohnix-text-dim)]">
                                                            {t(`team.module_hint_${moduleKey}`, { defaultValue: "" })}
                                                        </div>
                                                    </div>
                                                    <Form.Item name={["permissions", moduleKey]} className="m-0" initialValue="none">
                                                        <PermissionLevelPicker levels={levels} t={t} />
                                                    </Form.Item>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </div>

                    {/* Side column: special permissions + live impact summary */}
                    <aside className="flex flex-col gap-4 lg:sticky lg:top-0 lg:self-start">
                        <div>
                            <div className="mb-2 text-sm font-semibold text-[var(--ohnix-text-primary)]">{t("team.capabilities_title")}</div>
                            <div className="flex flex-col gap-2">
                                {SWITCH_CAPABILITIES.slice(0, 1).map(({ key, icon }) => (
                                    <Form.Item key={key} name={["capabilities", key]} valuePropName="checked" className="m-0" initialValue={false}>
                                        <CapabilityCard icon={icon} title={t(`team.capability_${key}`)} hint={t(`team.capability_${key}_hint`)} />
                                    </Form.Item>
                                ))}
                                <div
                                    className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2.5"
                                    style={{ opacity: priceOverride ? 0.55 : 1 }}
                                >
                                    <div className="flex items-start gap-3">
                                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--ohnix-line-2)] text-sm text-[var(--ohnix-text-dim)]">
                                            <PercentageOutlined />
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <div className="text-[13px] font-medium text-[var(--ohnix-text-primary)]">{t("team.capability_salesMaxDiscountPct")}</div>
                                            <div className="mt-0.5 text-[11px] leading-snug text-[var(--ohnix-text-dim)]">
                                                {priceOverride ? t("team.discount_covered_by_override") : t("team.capability_salesMaxDiscountPct_hint")}
                                            </div>
                                        </div>
                                    </div>
                                    <Form.Item name={["capabilities", "salesMaxDiscountPct"]} className="m-0" initialValue={0}>
                                        <DiscountControl disabled={Boolean(priceOverride)} />
                                    </Form.Item>
                                </div>
                                {SWITCH_CAPABILITIES.slice(1).map(({ key, icon }) => (
                                    <Form.Item key={key} name={["capabilities", key]} valuePropName="checked" className="m-0" initialValue={false}>
                                        <CapabilityCard icon={icon} title={t(`team.capability_${key}`)} hint={t(`team.capability_${key}_hint`)} />
                                    </Form.Item>
                                ))}
                            </div>
                        </div>

                        <div
                            className="rounded-2xl border px-4 py-3"
                            style={{
                                borderColor: sensitiveActions.length ? "rgba(245,158,11,0.35)" : "var(--ohnix-line-4)",
                                background: sensitiveActions.length ? "rgba(245,158,11,0.08)" : "var(--ohnix-line-1)",
                            }}
                        >
                            <div
                                className="mb-1.5 flex items-center gap-2 text-xs font-semibold"
                                style={{ color: sensitiveActions.length ? "var(--ohnix-alert-amber-text)" : "var(--ohnix-text-muted)" }}
                            >
                                <WarningOutlined />
                                {t("team.sensitive_title")}
                                {sensitiveActions.length > 0 && <span className="tabular-nums">· {sensitiveActions.length}</span>}
                            </div>
                            {sensitiveActions.length === 0 ? (
                                <p className="m-0 text-xs text-[var(--ohnix-text-muted)]">{t("team.sensitive_none")}</p>
                            ) : (
                                <ul className="m-0 space-y-1 pl-4 text-xs leading-snug text-[var(--ohnix-text-primary)]">
                                    {sensitiveActions.map((label) => (
                                        <li key={label}>{label}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </aside>
                </div>
            </Form>
        </Modal>
    );
};

export default RoleFormModal;
