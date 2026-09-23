import { useEffect, useState } from "react";
import { Alert, Button, Form, Input, InputNumber, Modal, Select, Table, Tag } from "antd";
import { CreditCardOutlined, PlusOutlined } from "@ant-design/icons";
import { financeService } from "../../services/financeService";
import { accountingService } from "../../services/accountingService";
import { useCurrency } from "../../context/CurrencyContext";
import { useTeam } from "../../context/TeamContext";
import useI18n from "../../hooks/useI18n";
import toast from "react-hot-toast";

// Configurable fee rules (datáfono/pasarela) applied automatically whenever a
// payment is registered against one - see accountingPosting.service.js's
// postOrderPaymentJournalEntry/postPurchasePaymentJournalEntry, which causes
// the fee into 530520 without the user having to compute or enter it by hand.
const PaymentMethodsCard = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canAdmin = hasPermission("finance", "admin");
    const [form] = Form.useForm();
    const [methods, setMethods] = useState([]);
    const [expenseAccounts, setExpenseAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [modal, setModal] = useState(null); // { mode: "create" | "edit", record? }

    const load = async () => {
        setLoading(true);
        try {
            const [methodResponse, accountResponse] = await Promise.all([
                financeService.listPaymentMethods(),
                accountingService.listChartOfAccounts(),
            ]);
            setMethods(methodResponse?.data || []);
            setExpenseAccounts((accountResponse?.data || []).filter((account) => account.account_type === "expense" && account.is_active));
        } catch {
            toast.error(t("finance.payment_methods_load_failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openCreate = () => {
        form.resetFields();
        form.setFieldsValue({ fee_percent: 0, fee_fixed_amount: 0 });
        setModal({ mode: "create" });
    };

    const openEdit = (record) => {
        form.setFieldsValue({
            name: record.name,
            fee_percent: record.fee_percent,
            fee_fixed_amount: record.fee_fixed_amount,
            expense_account_id: record.expense_account?.id,
        });
        setModal({ mode: "edit", record });
    };

    const save = async () => {
        const values = await form.validateFields();
        setSaving(true);
        try {
            if (modal.mode === "create") {
                await financeService.createPaymentMethod(values);
                toast.success(t("finance.payment_method_created"));
            } else {
                await financeService.updatePaymentMethod(modal.record.id, values);
                toast.success(t("finance.payment_method_updated"));
            }
            setModal(null);
            await load();
        } catch (error) {
            toast.error(error?.response?.data?.message || t("finance.payment_method_save_failed"));
        } finally {
            setSaving(false);
        }
    };

    const toggle = async (record) => {
        try {
            await financeService.setPaymentMethodActive(record.id, !record.is_active);
            toast.success(t("finance.payment_method_status_updated"));
            await load();
        } catch {
            toast.error(t("finance.payment_method_save_failed"));
        }
    };

    const activeCount = methods.filter((method) => method.is_active).length;
    const columns = [
        { title: t("finance.payment_method_name"), dataIndex: "name" },
        { title: t("finance.payment_method_fee_percent"), dataIndex: "fee_percent", align: "right", render: (value) => `${value}%` },
        { title: t("finance.payment_method_fee_fixed"), dataIndex: "fee_fixed_amount", align: "right", render: formatCurrency },
        { title: t("finance.payment_method_expense_account"), dataIndex: "expense_account", render: (account) => account ? `${account.code} · ${account.name}` : "—" },
        { title: t("common.status"), dataIndex: "is_active", render: (active) => <Tag color={active ? "success" : "default"}>{t(active ? "common.active" : "common.inactive")}</Tag> },
        ...(canAdmin ? [{ title: "", fixed: "right", width: 200, render: (_, record) => (
            <div className="flex gap-2 justify-end">
                <Button size="small" onClick={() => openEdit(record)}>{t("common.edit")}</Button>
                <Button size="small" onClick={() => toggle(record)}>{t(record.is_active ? "accounting.deactivate_account" : "accounting.activate_account")}</Button>
            </div>
        ) }] : []),
    ];

    return (
        <>
            <section className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)]">
                            <CreditCardOutlined className="text-xl text-[var(--ohnix-accent-2)]" />
                        </div>
                        <div>
                            <h2 className="m-0 text-lg font-bold text-[var(--ohnix-text-primary)]">{t("finance.payment_methods_title")}</h2>
                            <p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("finance.payment_methods_subtitle")}</p>
                        </div>
                    </div>
                    {canAdmin && <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>{t("finance.payment_method_new")}</Button>}
                </div>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.payment_methods_help_title")} description={t("finance.payment_methods_help_desc")} />
                <span className="block text-xs text-[var(--ohnix-text-muted)] mb-2">{t("finance.payment_methods_active_count", { count: activeCount })}</span>
                <Table
                    className="module-dark-table"
                    loading={loading}
                    rowKey="id"
                    columns={columns}
                    dataSource={methods}
                    scroll={{ x: 800 }}
                    pagination={{ pageSize: 8, hideOnSinglePage: true }}
                    locale={{ emptyText: t("finance.payment_methods_empty") }}
                />
            </section>
            <Modal
                className="accounting-modal"
                open={Boolean(modal)}
                onCancel={() => setModal(null)}
                onOk={save}
                confirmLoading={saving}
                title={t(modal?.mode === "edit" ? "finance.payment_method_edit_title" : "finance.payment_method_new_title")}
                destroyOnHidden
            >
                <Form form={form} layout="vertical">
                    <Form.Item name="name" label={t("finance.payment_method_name")} rules={[{ required: true, whitespace: true, message: t("validation.required_field") }]}>
                        <Input maxLength={120} placeholder={t("finance.payment_method_name_placeholder")} />
                    </Form.Item>
                    <div className="grid grid-cols-2 gap-3">
                        <Form.Item name="fee_percent" label={t("finance.payment_method_fee_percent")} rules={[{ required: true }]}>
                            <InputNumber className="w-full" min={0} max={15} precision={2} addonAfter="%" />
                        </Form.Item>
                        <Form.Item name="fee_fixed_amount" label={t("finance.payment_method_fee_fixed")} rules={[{ required: true }]}>
                            <InputNumber className="w-full" min={0} precision={2} />
                        </Form.Item>
                    </div>
                    <Form.Item name="expense_account_id" label={t("finance.payment_method_expense_account")} extra={t("finance.payment_method_expense_account_hint")} rules={[{ required: true, message: t("validation.required_field") }]}>
                        <Select showSearch optionFilterProp="label" options={expenseAccounts.map((account) => ({ value: account._id, label: `${account.code} · ${account.name}` }))} />
                    </Form.Item>
                </Form>
            </Modal>
        </>
    );
};

export default PaymentMethodsCard;
