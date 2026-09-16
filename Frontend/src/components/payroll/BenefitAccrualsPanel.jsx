import React, { useCallback, useEffect, useState } from "react";
import { Table, Button, Tag, Modal, Form, Select } from "antd";
import { DollarOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { payrollService } from "../../services/payrollService";
import EmptyState from "../common/EmptyState";

const TYPE_COLORS = { severance: "#7c6af7", severance_interest: "#f59e0b", service_bonus: "#44f3f0", vacation: "#29d8d5" };

// Prestaciones sociales (Fase 6) - running accrual balances per employee,
// with a "liquidar" action that pays out whatever's still pending (see
// payroll.service.js#settleEmployeeBenefit). Vacation is tracked in DAYS,
// not money (see EmployeeBenefitAccrual's schema comment), so it's shown
// but never offered for a cash settlement here.
const BenefitAccrualsPanel = ({ canEdit, cashAccounts }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [accruals, setAccruals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [settling, setSettling] = useState(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await payrollService.listBenefitAccruals();
            setAccruals(res.data || []);
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    const handleSettle = async () => {
        const values = await form.validateFields();
        try {
            await payrollService.settleBenefit({
                employeeId: settling.employee_id,
                type: settling.type,
                year: settling.year,
                semester: settling.semester,
                cashAccountId: values.cash_account_id,
            });
            toast.success(t("payroll.benefit_settled"));
            setSettling(null);
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("payroll.failed_settle_benefit"));
        }
    };

    const columns = [
        { title: t("payroll.employee"), dataIndex: "employee_name", key: "employee" },
        {
            title: t("payroll.benefit_type"),
            key: "type",
            render: (_, row) => (
                <Tag color={TYPE_COLORS[row.type]}>{t(`payroll.benefit_type_${row.type}`)}</Tag>
            ),
        },
        { title: t("payroll.year"), key: "year", render: (_, row) => (row.semester ? `${row.year} S${row.semester}` : row.year) },
        {
            title: t("payroll.pending_amount"),
            key: "pending",
            render: (_, row) => (row.type === "vacation" ? `${row.accrued_days - row.used_days} ${t("payroll.days")}` : formatCurrency(row.pending_amount)),
        },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, row) =>
                row.type !== "vacation" && row.pending_amount > 0 && canEdit ? (
                    <Button size="small" icon={<DollarOutlined />} onClick={() => setSettling(row)}>
                        {t("payroll.settle_benefit")}
                    </Button>
                ) : null,
        },
    ];

    return (
        <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] overflow-hidden">
            <Table
                rowKey="_id"
                columns={columns}
                dataSource={accruals}
                loading={loading}
                pagination={{ pageSize: 20 }}
                locale={{ emptyText: <EmptyState icon={<DollarOutlined />} title={t("payroll.no_benefit_accruals")} /> }}
            />

            <Modal
                title={t("payroll.settle_benefit")}
                open={Boolean(settling)}
                onCancel={() => setSettling(null)}
                onOk={handleSettle}
                okText={t("payroll.confirm_payment")}
                cancelText={t("common.cancel")}
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="cash_account_id" label={t("payroll.cash_account")} rules={[{ required: true, message: t("payroll.cash_account_required") }]}>
                        <Select options={(cashAccounts || []).map((a) => ({ value: a._id, label: a.name }))} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default BenefitAccrualsPanel;
