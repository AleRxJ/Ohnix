import React, { useContext, useEffect, useState } from "react";
import { Layout, Tabs, Table, Button, Tag, Popconfirm, Tooltip } from "antd";
import { PlusOutlined, TeamOutlined, CalendarOutlined, DollarOutlined, SettingOutlined, EyeOutlined, DeleteOutlined, EditOutlined, StopOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../hooks/useI18n";
import AuthContext from "../context/AuthContext";
import { useTeam } from "../context/TeamContext";
import { useCurrency } from "../context/CurrencyContext";
import { useEmployees } from "../hooks/payroll/useEmployees";
import { usePayrollPeriods } from "../hooks/payroll/usePayrollPeriods";
import { useCashAccounts } from "../hooks/finance/useCashAccounts";
import EmployeeModal from "../components/payroll/EmployeeModal";
import CreatePayrollPeriodModal from "../components/payroll/CreatePayrollPeriodModal";
import PayrollPeriodDetailDrawer from "../components/payroll/PayrollPeriodDetailDrawer";
import PayPeriodModal from "../components/payroll/PayPeriodModal";
import BenefitAccrualsPanel from "../components/payroll/BenefitAccrualsPanel";
import LegalParametersPanel from "../components/payroll/LegalParametersPanel";
import TerminationSettlementModal from "../components/payroll/TerminationSettlementModal";
import EmptyState from "../components/common/EmptyState";

const { Content } = Layout;

const PERIOD_STATUS_COLORS = { draft: "#8b98a0", calculated: "#7c6af7", approved: "#f59e0b", paid: "#44f3f0", cancelled: "#fb7185" };

const EmployeesPanel = ({ canEdit }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { employees, loading, createEmployee, updateEmployee, deleteEmployee } = useEmployees();
    const { accounts: cashAccounts, load: loadCashAccounts } = useCashAccounts();
    const [modalVisible, setModalVisible] = useState(false);
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [terminating, setTerminating] = useState(null);

    useEffect(() => {
        loadCashAccounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async (values) => {
        setSaving(true);
        const result = editing ? await updateEmployee(editing._id, values) : await createEmployee(values);
        setSaving(false);
        if (result.success) {
            setModalVisible(false);
            setEditing(null);
        }
    };

    const columns = [
        { title: t("payroll.full_name"), dataIndex: "full_name", key: "full_name" },
        { title: t("payroll.document_number"), dataIndex: "document_number", key: "document_number" },
        { title: t("payroll.position"), dataIndex: "position", key: "position" },
        { title: t("payroll.base_salary"), key: "base_salary", render: (_, row) => formatCurrency(row.base_salary) },
        {
            title: t("payroll.pay_frequency"),
            key: "pay_frequency",
            render: (_, row) => t(`payroll.frequency_${row.pay_frequency}`),
        },
        {
            title: t("common.status"),
            key: "status",
            render: (_, row) => (
                <Tag color={row.status === "active" ? "green" : row.status === "terminated" ? "red" : "default"}>
                    {t(`payroll.employee_status_${row.status}`)}
                </Tag>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, row) => (
                <div className="flex gap-1 justify-end">
                    <Button
                        type="text"
                        size="small"
                        icon={<EditOutlined />}
                        disabled={!canEdit}
                        onClick={() => {
                            setEditing(row);
                            setModalVisible(true);
                        }}
                    />
                    {row.status !== "terminated" && (
                        <Tooltip title={t("payroll.terminate_employee")}>
                            <Button type="text" size="small" icon={<StopOutlined />} disabled={!canEdit} onClick={() => setTerminating(row)} />
                        </Tooltip>
                    )}
                    <Popconfirm title={t("common.warning")} okText={t("common.yes")} cancelText={t("common.no")} onConfirm={() => deleteEmployee(row._id)} disabled={!canEdit}>
                        <Button type="text" danger size="small" icon={<DeleteOutlined />} disabled={!canEdit} />
                    </Popconfirm>
                </div>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        disabled={!canEdit}
                        onClick={() => {
                            setEditing(null);
                            setModalVisible(true);
                        }}
                        className="bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                    >
                        {t("payroll.new_employee")}
                    </Button>
                </Tooltip>
            </div>
            <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] overflow-hidden">
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={employees}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{ emptyText: <EmptyState icon={<TeamOutlined />} title={t("payroll.no_employees")} /> }}
                />
            </div>
            <EmployeeModal
                visible={modalVisible}
                editingEmployee={editing}
                loading={saving}
                onSave={handleSave}
                onCancel={() => {
                    setModalVisible(false);
                    setEditing(null);
                }}
            />
            <TerminationSettlementModal
                visible={Boolean(terminating)}
                employee={terminating}
                cashAccounts={(cashAccounts || []).filter((a) => a.is_active !== false)}
                onUpdateContractEndDate={(id, contractEndDate) => updateEmployee(id, { contract_end_date: contractEndDate })}
                onClose={() => setTerminating(null)}
            />
        </div>
    );
};

const PeriodsPanel = ({ canEdit }) => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const { periods, loading, createPeriod, calculatePeriod, approvePeriod, payPeriod, cancelPeriod } = usePayrollPeriods();
    const { employees } = useEmployees();
    const { accounts: cashAccounts, load: loadCashAccounts } = useCashAccounts();
    const [createVisible, setCreateVisible] = useState(false);
    const [creating, setCreating] = useState(false);
    const [detailPeriodId, setDetailPeriodId] = useState(null);
    const [payingPeriod, setPayingPeriod] = useState(null);
    const [payLoading, setPayLoading] = useState(false);

    useEffect(() => {
        loadCashAccounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleCreate = async (payload) => {
        setCreating(true);
        const result = await createPeriod(payload);
        setCreating(false);
        if (result.success) setCreateVisible(false);
    };

    const handlePay = async ({ cashAccountId, paymentDate }) => {
        setPayLoading(true);
        const result = await payPeriod(payingPeriod._id, { cashAccountId, paymentDate });
        setPayLoading(false);
        if (result.success) {
            setPayingPeriod(null);
            toast.success(t("payroll.period_paid"));
        }
    };

    const columns = [
        {
            title: t("payroll.period_range"),
            key: "range",
            render: (_, row) => `${new Date(row.start_date).toLocaleDateString(currentLanguage)} - ${new Date(row.end_date).toLocaleDateString(currentLanguage)}`,
        },
        { title: t("payroll.periodicity"), key: "periodicity", render: (_, row) => t(`payroll.frequency_${row.periodicity}`) },
        { title: t("payroll.total_net_pay"), key: "total", render: (_, row) => formatCurrency(row.total_net_pay) },
        {
            title: t("common.status"),
            key: "status",
            render: (_, row) => (
                <span className="status-pill" style={{ color: PERIOD_STATUS_COLORS[row.status], background: `${PERIOD_STATUS_COLORS[row.status]}18`, border: `1px solid ${PERIOD_STATUS_COLORS[row.status]}33` }}>
                    <span className="status-dot" style={{ background: PERIOD_STATUS_COLORS[row.status] }} />
                    {t(`payroll.period_status_${row.status}`)}
                </span>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, row) => (
                <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setDetailPeriodId(row._id)} />
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                    <Button type="primary" icon={<PlusOutlined />} disabled={!canEdit} onClick={() => setCreateVisible(true)} className="bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium">
                        {t("payroll.new_period")}
                    </Button>
                </Tooltip>
            </div>
            <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] overflow-hidden">
                <Table
                    rowKey="_id"
                    columns={columns}
                    dataSource={periods}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{ emptyText: <EmptyState icon={<CalendarOutlined />} title={t("payroll.no_periods")} /> }}
                />
            </div>

            <CreatePayrollPeriodModal visible={createVisible} employees={employees} loading={creating} onSubmit={handleCreate} onCancel={() => setCreateVisible(false)} />

            <PayrollPeriodDetailDrawer
                periodId={detailPeriodId}
                canEdit={canEdit}
                onClose={() => setDetailPeriodId(null)}
                onCalculate={calculatePeriod}
                onApprove={approvePeriod}
                onOpenPay={(period) => setPayingPeriod(period)}
                onCancel={cancelPeriod}
            />

            <PayPeriodModal
                visible={Boolean(payingPeriod)}
                period={payingPeriod}
                cashAccounts={(cashAccounts || []).filter((a) => a.is_active !== false)}
                loading={payLoading}
                onSubmit={handlePay}
                onCancel={() => setPayingPeriod(null)}
            />
        </div>
    );
};

const BenefitsPanel = ({ canEdit }) => {
    const { accounts: cashAccounts, load: loadCashAccounts } = useCashAccounts();
    useEffect(() => {
        loadCashAccounts();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return <BenefitAccrualsPanel canEdit={canEdit} cashAccounts={(cashAccounts || []).filter((a) => a.is_active !== false)} />;
};

const Payroll = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("payroll", "edit");
    const isAdmin = user?.role === "admin";

    const items = [
        { key: "employees", label: t("payroll.tab_employees"), children: <EmployeesPanel canEdit={canEdit} /> },
        { key: "periods", label: t("payroll.tab_periods"), children: <PeriodsPanel canEdit={canEdit} /> },
        { key: "benefits", label: t("payroll.tab_benefits"), children: <BenefitsPanel canEdit={canEdit} /> },
        ...(isAdmin ? [{ key: "legal", label: <span className="inline-flex items-center gap-1"><SettingOutlined />{t("payroll.tab_legal_parameters")}</span>, children: <LegalParametersPanel /> }] : []),
    ];

    return (
        <Layout className="bg-transparent">
            <Content className="p-2 sm:p-4 lg:p-6 bg-transparent text-[var(--ohnix-text-primary)]">
                <div className="max-w-full lg:max-w-7xl mx-auto">
                    <h1 className="mb-1 text-3xl sm:text-4xl font-bold flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                        {t("payroll.title")}
                        <DollarOutlined className="text-[#44F3F0] inline-block ml-2" />
                    </h1>
                    <p className="text-[var(--ohnix-text-muted)] text-base md:text-sm mb-4 hidden sm:block">{t("payroll.subtitle")}</p>
                    <Tabs items={items} />
                </div>
            </Content>
        </Layout>
    );
};

export default Payroll;
