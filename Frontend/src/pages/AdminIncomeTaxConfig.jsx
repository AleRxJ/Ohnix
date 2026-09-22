// Frontend/src/pages/AdminIncomeTaxConfig.jsx
//
// Platform-admin-only screen for the renta/RST reference tables
// (IncomeTaxYearConfig, SimpleRegimeBracket) - these are national tax law,
// shared by every tenant's estimated Declaración de Renta, so only an Ohnix
// admin (not a company's own "accounting" permission) may edit them. See
// Backend/services/incomeTaxConfig.service.js and company.routes.js's
// /admin/income-tax-config routes.
import { useContext, useEffect, useState } from "react";
import { Alert, Button, Form, InputNumber, Modal, Select, Table, Tag } from "antd";
import { CalculatorOutlined, EditOutlined, PlusOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { adminService } from "../services/adminService";
import PageHeader from "../components/common/PageHeader";

const GROUPS = ["group1", "group2", "group3", "group4"];
const DEFAULT_BRACKET_SHAPE = [
    { minUvt: 0, maxUvt: 6000 },
    { minUvt: 6000, maxUvt: 15000 },
    { minUvt: 15000, maxUvt: 30000 },
    { minUvt: 30000, maxUvt: null },
];

const AdminIncomeTaxConfig = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [loading, setLoading] = useState(true);
    const [configs, setConfigs] = useState([]);
    const [configModalOpen, setConfigModalOpen] = useState(false);
    const [savingConfig, setSavingConfig] = useState(false);
    const [configForm] = Form.useForm();

    const [bracketYear, setBracketYear] = useState(new Date().getFullYear());
    const [bracketRows, setBracketRows] = useState([]);
    const [bracketsLoading, setBracketsLoading] = useState(false);
    const [savingBrackets, setSavingBrackets] = useState(false);

    const fetchConfigs = async () => {
        try {
            setLoading(true);
            const response = await adminService.listIncomeTaxYearConfigs();
            setConfigs(response?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    const fetchBrackets = async (year) => {
        setBracketsLoading(true);
        try {
            const response = await adminService.listSimpleRegimeBrackets(year);
            const existing = response?.data || [];
            const rows = GROUPS.flatMap((group) =>
                DEFAULT_BRACKET_SHAPE.map((shape) => {
                    const found = existing.find((b) => b.group === group && Number(b.min_uvt) === shape.minUvt);
                    return found || { group, min_uvt: shape.minUvt, max_uvt: shape.maxUvt, rate_percent: 0, is_verified: false };
                })
            );
            setBracketRows(rows);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setBracketsLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        fetchConfigs();
        fetchBrackets(bracketYear);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.only_admin")} />
            </div>
        );
    }

    const openConfigModal = (config) => {
        configForm.resetFields();
        configForm.setFieldsValue(config || { year: new Date().getFullYear() });
        setConfigModalOpen(true);
    };

    const saveConfig = async () => {
        const values = await configForm.validateFields();
        setSavingConfig(true);
        try {
            await adminService.upsertIncomeTaxYearConfig({ year: values.year, ordinary_rate_percent: values.ordinary_rate_percent, uvt_value: values.uvt_value });
            toast.success(t("admin.income_tax_config_saved"));
            setConfigModalOpen(false);
            await fetchConfigs();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setSavingConfig(false);
        }
    };

    const toggleConfigVerified = async (config) => {
        try {
            await adminService.setIncomeTaxYearConfigVerified(config.year, !config.is_verified);
            toast.success(t("admin.income_tax_config_saved"));
            await fetchConfigs();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const updateBracketRow = (index, field, value) => {
        setBracketRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
    };

    const saveBrackets = async () => {
        setSavingBrackets(true);
        try {
            await adminService.upsertSimpleRegimeBrackets(
                bracketYear,
                bracketRows.map((row) => ({ group: row.group, min_uvt: row.min_uvt, max_uvt: row.max_uvt, rate_percent: row.rate_percent }))
            );
            toast.success(t("admin.income_tax_config_saved"));
            await fetchBrackets(bracketYear);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setSavingBrackets(false);
        }
    };

    const toggleBracketsVerified = async (nextVerified) => {
        try {
            await adminService.setSimpleRegimeBracketsVerified(bracketYear, nextVerified);
            toast.success(t("admin.income_tax_config_saved"));
            await fetchBrackets(bracketYear);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const allBracketsVerified = bracketRows.length > 0 && bracketRows.every((row) => row.is_verified);

    const configColumns = [
        { title: t("admin.income_tax_config_col_year"), dataIndex: "year", width: 100 },
        { title: t("admin.income_tax_config_col_ordinary_rate"), dataIndex: "ordinary_rate_percent", render: (v) => `${v}%` },
        { title: t("admin.income_tax_config_col_uvt"), dataIndex: "uvt_value", render: (v) => `$${Number(v).toLocaleString("es-CO")}` },
        {
            title: t("common.status"),
            dataIndex: "is_verified",
            render: (verified) => <Tag color={verified ? "success" : "warning"}>{t(verified ? "admin.income_tax_config_verified" : "admin.income_tax_config_unverified")}</Tag>,
        },
        {
            title: "",
            fixed: "right",
            width: 220,
            render: (_, config) => (
                <div className="flex gap-2">
                    <Button size="small" icon={<EditOutlined />} onClick={() => openConfigModal(config)}>{t("common.edit")}</Button>
                    <Button size="small" onClick={() => toggleConfigVerified(config)}>{t(config.is_verified ? "admin.income_tax_config_unverify" : "admin.income_tax_config_verify")}</Button>
                </div>
            ),
        },
    ];

    const bracketColumns = [
        { title: t("admin.income_tax_config_col_group"), dataIndex: "group", width: 100, render: (v) => t(`accounting.renta_simple_${v}`) },
        {
            title: t("admin.income_tax_config_col_min_uvt"),
            dataIndex: "min_uvt",
            width: 130,
            render: (v, row, index) => <InputNumber className="w-full" min={0} value={v} onChange={(value) => updateBracketRow(index, "min_uvt", value ?? 0)} />,
        },
        {
            title: t("admin.income_tax_config_col_max_uvt"),
            dataIndex: "max_uvt",
            width: 130,
            render: (v, row, index) => <InputNumber className="w-full" min={0} placeholder="∞" value={v} onChange={(value) => updateBracketRow(index, "max_uvt", value)} />,
        },
        {
            title: t("admin.income_tax_config_col_rate"),
            dataIndex: "rate_percent",
            width: 120,
            render: (v, row, index) => <InputNumber className="w-full" min={0} max={100} step={0.1} addonAfter="%" value={v} onChange={(value) => updateBracketRow(index, "rate_percent", value ?? 0)} />,
        },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader title={t("admin.income_tax_config_title")} subtitle={t("admin.income_tax_config_subtitle")} icon={<CalculatorOutlined />} />

            <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.income_tax_config_disclaimer")} />

            <div className="module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold">{t("admin.income_tax_config_ordinary_section")}</h3>
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => openConfigModal(null)}>{t("admin.income_tax_config_add_year")}</Button>
                </div>
                <Table className="module-dark-table" loading={loading} rowKey="year" columns={configColumns} dataSource={configs} pagination={{ pageSize: 8, hideOnSinglePage: true }} />
            </div>

            <div className="module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <h3 className="text-base font-semibold">{t("admin.income_tax_config_simple_section")}</h3>
                    <div className="flex items-center gap-2">
                        <Select
                            value={bracketYear}
                            style={{ width: 120 }}
                            onChange={(value) => { setBracketYear(value); fetchBrackets(value); }}
                            options={Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - i).map((y) => ({ value: y, label: y }))}
                        />
                        <Button icon={<SafetyCertificateOutlined />} onClick={() => toggleBracketsVerified(!allBracketsVerified)}>
                            {t(allBracketsVerified ? "admin.income_tax_config_unverify" : "admin.income_tax_config_verify")}
                        </Button>
                        <Button type="primary" loading={savingBrackets} onClick={saveBrackets}>{t("common.save")}</Button>
                    </div>
                </div>
                <Table className="module-dark-table" loading={bracketsLoading} rowKey={(row) => `${row.group}-${row.min_uvt}`} columns={bracketColumns} dataSource={bracketRows} pagination={false} />
            </div>

            <Modal open={configModalOpen} onCancel={() => setConfigModalOpen(false)} onOk={saveConfig} confirmLoading={savingConfig} title={t("admin.income_tax_config_add_year")} destroyOnHidden>
                <Form form={configForm} layout="vertical">
                    <Form.Item name="year" label={t("admin.income_tax_config_col_year")} rules={[{ required: true }]}>
                        <InputNumber className="w-full" min={2000} max={2200} />
                    </Form.Item>
                    <Form.Item name="ordinary_rate_percent" label={t("admin.income_tax_config_col_ordinary_rate")} rules={[{ required: true }]}>
                        <InputNumber className="w-full" min={0} max={100} step={0.5} addonAfter="%" />
                    </Form.Item>
                    <Form.Item name="uvt_value" label={t("admin.income_tax_config_col_uvt")} rules={[{ required: true }]}>
                        <InputNumber className="w-full" min={0} step={1} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default AdminIncomeTaxConfig;
