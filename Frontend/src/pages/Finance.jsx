import { useEffect, useState } from "react";
import { Alert, Button, DatePicker, Drawer, Form, Input, InputNumber, Modal, Select, Spin, Table, Popconfirm, Tooltip } from "antd";
import { AuditOutlined, HistoryOutlined, PlusOutlined, WalletOutlined, BankOutlined, EditOutlined, StopOutlined, SwapOutlined, UnorderedListOutlined, RiseOutlined, FallOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { financeErrorMessage } from "../utils/financeError";
import PageHeader from "../components/common/PageHeader";
import CashAccountFormModal from "../components/finance/CashAccountFormModal";
import CashAccountMovementsDrawer from "../components/finance/CashAccountMovementsDrawer";
import { useCashAccounts } from "../hooks/finance/useCashAccounts";
import { pointOfSaleService } from "../services/pointOfSaleService";
import { useCurrency } from "../context/CurrencyContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";
import AccountsPayablePlanner from "../components/finance/AccountsPayablePlanner";
import AccountsReceivablePlanner from "../components/finance/AccountsReceivablePlanner";
import { accountingService } from "../services/accountingService";
import CashIntegrityPanel from "../components/finance/CashIntegrityPanel";
import PaymentMethodsCard from "../components/finance/PaymentMethodsCard";
import { financeService } from "../services/financeService";

const ACCOUNT_TYPE_ICON = { cash: WalletOutlined, bank: BankOutlined };

const Finance = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("finance", "edit");
    const { accounts, loading, submitting, load: reloadAccounts, createAccount, updateAccount, deactivateAccount, transferCash, adjustCash } = useCashAccounts();
    const [pointsOfSale, setPointsOfSale] = useState([]);
    const [assetAccounts, setAssetAccounts] = useState([]);
    const [modal, setModal] = useState(null); // { mode: "create" | "edit", record? }
    const [movementsAccount, setMovementsAccount] = useState(null);
    const [form] = Form.useForm();
    const [transferOpen, setTransferOpen] = useState(false);
    const [transferForm] = Form.useForm();
    const [adjustmentAccount, setAdjustmentAccount] = useState(null);
    const [counterpartAccounts, setCounterpartAccounts] = useState([]);
    const [adjustmentForm] = Form.useForm();
    const adjustmentAmount = Form.useWatch("amount", adjustmentForm);
    const [historyAccount, setHistoryAccount] = useState(null);
    const [historyRows, setHistoryRows] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [equityModal, setEquityModal] = useState(null); // { type: "contribution" | "distribution" }
    const [equityForm] = Form.useForm();
    const [equitySubmitting, setEquitySubmitting] = useState(false);

    useEffect(() => {
        pointOfSaleService
            .list()
            .then((res) => setPointsOfSale((res?.data || []).filter((pos) => pos.isActive)))
            .catch(() => {});
        accountingService.listChartOfAccounts().then((res) => setAssetAccounts((res?.data || []).filter((row) => row.account_type === "asset" && row.is_active))).catch(() => {});
    }, []);

    const openCreate = () => {
        form.resetFields();
        form.setFieldsValue({ account_type: "cash" });
        setModal({ mode: "create" });
    };

    const openEdit = (record) => {
        form.setFieldsValue({
            name: record.name,
            account_type: record.account_type,
            point_of_sale_id: record.point_of_sale?._id || undefined,
            bank_name: record.bank_name,
            account_number: record.account_number,
            chart_account_id: record.chart_account?._id || undefined,
        });
        setModal({ mode: "edit", record });
    };

    const closeModal = () => {
        setModal(null);
        form.resetFields();
    };

    const handleSubmit = async (values) => {
        const success =
            modal.mode === "create"
                ? await createAccount({
                      name: values.name.trim(),
                      account_type: values.account_type,
                      point_of_sale_id: values.point_of_sale_id || null,
                      bank_name: values.bank_name,
                      account_number: values.account_number,
                      chart_account_id: values.chart_account_id || null,
                  })
                : await updateAccount(modal.record._id, {
                      name: values.name.trim(),
                      bank_name: values.bank_name,
                      account_number: values.account_number,
                      chart_account_id: values.chart_account_id || null,
                  });
        if (success) closeModal();
    };
    const openTransfer = () => {
        transferForm.resetFields();
        transferForm.setFieldsValue({ transfer_date: dayjs() });
        setTransferOpen(true);
    };
    const handleTransfer = async (values) => {
        const success = await transferCash({ from_cash_account_id: values.from_cash_account_id, to_cash_account_id: values.to_cash_account_id, amount: values.amount, description: values.description?.trim() || undefined, transfer_date: values.transfer_date.toISOString() });
        if (success) { setTransferOpen(false); transferForm.resetFields(); }
    };
    const openAdjustment = async (record) => {
        try {
            const response = await accountingService.listChartOfAccounts();
            setCounterpartAccounts((response?.data || []).filter((row) => row.is_active));
            adjustmentForm.resetFields();
            adjustmentForm.setFieldsValue({ adjustment_date: dayjs() });
            setAdjustmentAccount(record);
        } catch { Modal.error({ title: t("finance.adjustment_failed"), content: t("finance.adjustment_accounts_failed") }); }
    };
    const handleAdjustment = async (values) => {
        const success = await adjustCash({ cash_account_id: adjustmentAccount._id, counterpart_account_id: values.counterpart_account_id, amount: values.amount, reason: values.reason.trim(), adjustment_date: values.adjustment_date.toISOString() });
        if (success) { setAdjustmentAccount(null); adjustmentForm.resetFields(); }
    };
    const openEquityModal = (type) => {
        equityForm.resetFields();
        equityForm.setFieldsValue({ date: dayjs() });
        setEquityModal({ type });
    };
    const handleEquitySubmit = async (values) => {
        setEquitySubmitting(true);
        const payload = { amount: values.amount, cash_account_id: values.cash_account_id, description: values.description?.trim() || undefined };
        try {
            if (equityModal.type === "contribution") {
                await financeService.registerCapitalContribution({ ...payload, contribution_date: values.date.toISOString() });
                toast.success(t("finance.capital_contribution_success"));
            } else {
                await financeService.registerEquityDistribution({ ...payload, distribution_date: values.date.toISOString() });
                toast.success(t("finance.equity_distribution_success"));
            }
            setEquityModal(null);
            equityForm.resetFields();
            await reloadAccounts();
        } catch (error) {
            toast.error(financeErrorMessage(error, t, equityModal.type === "contribution" ? "finance.capital_contribution_failed" : "finance.equity_distribution_failed"));
        } finally {
            setEquitySubmitting(false);
        }
    };
    const openConfigurationHistory = async (record) => {
        setHistoryAccount(record); setHistoryLoading(true);
        try { const response = await financeService.listCashAccountConfigurationHistory(record._id); setHistoryRows(response?.data || []); }
        catch { setHistoryRows([]); Modal.error({ title: t("finance.mapping_history_failed") }); }
        finally { setHistoryLoading(false); }
    };

    return (
        <div className="min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <div className="space-y-6">
                    <PageHeader
                        title={t("finance.page_title")}
                        subtitle={t("finance.page_subtitle")}
                        icon={<WalletOutlined />}
                        actionButton={
                            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                                <Tooltip title={accounts.length === 0 ? t("finance.no_accounts") : canEdit ? "" : t("common.no_permission_to_edit")}><span className="w-full sm:w-auto inline-block"><Button icon={<RiseOutlined />} onClick={() => openEquityModal("contribution")} size="large" className="w-full" disabled={!canEdit || accounts.length === 0}>{t("finance.capital_contribution_cta")}</Button></span></Tooltip>
                                <Tooltip title={accounts.length === 0 ? t("finance.no_accounts") : canEdit ? "" : t("common.no_permission_to_edit")}><span className="w-full sm:w-auto inline-block"><Button icon={<FallOutlined />} onClick={() => openEquityModal("distribution")} size="large" className="w-full" disabled={!canEdit || accounts.length === 0}>{t("finance.equity_distribution_cta")}</Button></span></Tooltip>
                                <Tooltip title={accounts.length < 2 ? t("finance.transfer_requires_accounts") : canEdit ? "" : t("common.no_permission_to_edit")}><span className="w-full sm:w-auto inline-block"><Button icon={<SwapOutlined />} onClick={openTransfer} size="large" className="w-full" disabled={!canEdit || accounts.length < 2}>{t("finance.transfer_cta")}</Button></span></Tooltip>
                                <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                                <span className="w-full sm:w-auto inline-block">
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        onClick={openCreate}
                                        size="large"
                                        className="w-full min-w-[120px] sm:w-auto"
                                        disabled={!canEdit}
                                    >
                                        {t("finance.create_cta")}
                                    </Button>
                                </span>
                                </Tooltip>
                            </div>
                        }
                    />

                    {loading ? (
                        <div className="flex justify-center py-12">
                            <Spin size="large" />
                        </div>
                    ) : accounts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-16 text-center gap-2 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]">
                            <WalletOutlined className="text-3xl text-[var(--ohnix-text-dim)]" />
                            <span className="text-sm text-[var(--ohnix-text-muted)]">{t("finance.no_accounts")}</span>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                            {accounts.map((record, idx) => {
                                const Icon = ACCOUNT_TYPE_ICON[record.account_type] || WalletOutlined;
                                return (
                                    <div
                                        key={record._id}
                                        className={`hover-lift animate-fade-up stagger-${Math.min(idx + 1, 4)} rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-4 flex flex-col gap-3`}
                                    >
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)] shadow-[var(--ohnix-accent-glow)]">
                                                    <Icon className="text-lg text-[var(--ohnix-accent-2)]" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="m-0 font-semibold text-[var(--ohnix-text-primary)] truncate">{record.name}</p>
                                                    <span className="text-xs text-[var(--ohnix-text-muted)]">
                                                        {record.point_of_sale?.name || t("finance.point_of_sale_all_locations")}
                                                    </span>
                                                    <span className="block text-[11px] text-[var(--ohnix-accent-2)] mt-0.5">{record.chart_account ? `${record.chart_account.code} · ${record.chart_account.name}` : t("finance.chart_account_automatic")}</span>
                                                </div>
                                            </div>
                                            {record.is_active ? (
                                                <span className="status-pill" style={{ color: "var(--ohnix-status-success)", background: "var(--ohnix-status-success-soft)", border: "1px solid var(--ohnix-status-success-line)" }}>
                                                    <span className="status-dot" style={{ background: "var(--ohnix-status-success)" }} />
                                                    {t("finance.status_active")}
                                                </span>
                                            ) : (
                                                <span className="status-pill" style={{ color: "var(--ohnix-text-dim)", background: "var(--ohnix-line-2)", border: "1px solid var(--ohnix-line-4)" }}>
                                                    <span className="status-dot" style={{ background: "var(--ohnix-text-dim)" }} />
                                                    {t("finance.status_inactive")}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between border-t border-[var(--ohnix-line-3)] pt-3">
                                            <span className="text-xs text-[var(--ohnix-text-muted)] uppercase tracking-wide">{t("finance.balance_label")}</span>
                                            <span className="text-lg font-bold text-[var(--ohnix-accent-2)]">{formatCurrency(record.balance)}</span>
                                        </div>

                                        <div className="flex gap-2 pt-1">
                                            <Button
                                                icon={<UnorderedListOutlined />}
                                                onClick={() => setMovementsAccount(record)}
                                                className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-soft)] hover:text-[var(--ohnix-accent-2)] hover:border-[var(--ohnix-accent-line-strong)] hover:bg-[var(--ohnix-accent-soft)] transition-all duration-200"
                                            >
                                                {t("finance.view_movements")}
                                            </Button>
                                            {canEdit && (
                                                <Tooltip title={t("finance.adjustment_cta")}><Button icon={<AuditOutlined />} onClick={() => openAdjustment(record)} className="h-9 w-9 flex items-center justify-center rounded-lg bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-soft)] hover:text-[var(--ohnix-accent-2)] hover:border-[var(--ohnix-accent-line-strong)] transition-all duration-200" /></Tooltip>
                                            )}
                                            <Tooltip title={t("finance.mapping_history_cta")}><Button icon={<HistoryOutlined />} onClick={() => openConfigurationHistory(record)} className="h-9 w-9 flex items-center justify-center rounded-lg bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-soft)] hover:text-[var(--ohnix-accent-2)] hover:border-[var(--ohnix-accent-line-strong)] transition-all duration-200" /></Tooltip>
                                            {canEdit && (
                                                <Button
                                                    icon={<EditOutlined />}
                                                    onClick={() => openEdit(record)}
                                                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-soft)] hover:text-[var(--ohnix-accent-2)] hover:border-[var(--ohnix-accent-line-strong)] transition-all duration-200"
                                                />
                                            )}
                                            {canEdit && record.is_active && (
                                                <Popconfirm
                                                    title={t("finance.deactivate_confirm_title")}
                                                    description={t("finance.deactivate_confirm_content")}
                                                    okText={t("common.yes")}
                                                    cancelText={t("common.no")}
                                                    onConfirm={() => deactivateAccount(record._id)}
                                                >
                                                    <Button
                                                        icon={<StopOutlined />}
                                                        className="h-9 w-9 flex items-center justify-center rounded-lg bg-[var(--ohnix-status-danger-soft)] border border-[var(--ohnix-status-danger-line)] text-[var(--ohnix-status-danger)] hover:bg-[var(--ohnix-status-danger-soft-hover)] hover:border-[var(--ohnix-status-danger)] transition-all duration-200"
                                                    />
                                                </Popconfirm>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <CashIntegrityPanel onOpenMovements={setMovementsAccount} />
                    <PaymentMethodsCard />
                    <AccountsPayablePlanner canEdit={canEdit} />
                    <AccountsReceivablePlanner canEdit={canEdit} />
                </div>
            </div>

            <CashAccountFormModal
                open={Boolean(modal)}
                mode={modal?.mode}
                form={form}
                pointsOfSale={pointsOfSale}
                chartAccounts={assetAccounts}
                submitting={submitting}
                onCancel={closeModal}
                onSubmit={handleSubmit}
            />

            <CashAccountMovementsDrawer
                visible={Boolean(movementsAccount)}
                onClose={() => setMovementsAccount(null)}
                account={movementsAccount}
            />
            <Modal title={t("finance.transfer_title")} open={transferOpen} onCancel={() => setTransferOpen(false)} onOk={() => transferForm.submit()} confirmLoading={submitting} okText={t("finance.transfer_confirm")}>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.transfer_help_title")} description={t("finance.transfer_help_desc")} />
                <Form form={transferForm} layout="vertical" onFinish={handleTransfer}>
                    <Form.Item name="from_cash_account_id" label={t("finance.transfer_from")} rules={[{ required: true, message: t("validation.required_field") }]}><Select showSearch optionFilterProp="label" options={accounts.filter((row) => row.is_active).map((row) => ({ value: row._id, label: `${row.name} · ${formatCurrency(row.balance)}` }))} placeholder={t("finance.transfer_from_placeholder")} /></Form.Item>
                    <Form.Item noStyle shouldUpdate={(before, after) => before.from_cash_account_id !== after.from_cash_account_id}>{({ getFieldValue }) => <Form.Item name="to_cash_account_id" label={t("finance.transfer_to")} rules={[{ required: true, message: t("validation.required_field") }]}><Select showSearch optionFilterProp="label" options={accounts.filter((row) => row.is_active && row._id !== getFieldValue("from_cash_account_id")).map((row) => ({ value: row._id, label: row.name }))} placeholder={t("finance.transfer_to_placeholder")} /></Form.Item>}</Form.Item>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3"><Form.Item name="amount" label={t("finance.transfer_amount")} rules={[{ required: true, message: t("validation.required_field") }]}><InputNumber min={0.01} precision={2} className="w-full" /></Form.Item><Form.Item name="transfer_date" label={t("finance.transfer_date")} rules={[{ required: true, message: t("validation.required_field") }]}><DatePicker className="w-full" /></Form.Item></div>
                    <Form.Item name="description" label={t("finance.transfer_description")}><Input maxLength={200} placeholder={t("finance.transfer_description_placeholder")} /></Form.Item>
                </Form>
            </Modal>
            <Modal title={t("finance.adjustment_title", { name: adjustmentAccount?.name || "" })} open={Boolean(adjustmentAccount)} onCancel={() => setAdjustmentAccount(null)} onOk={() => adjustmentForm.submit()} confirmLoading={submitting} okText={t("finance.adjustment_confirm")}>
                <Alert className={`dark-alert ${Number(adjustmentAmount) < 0 ? "dark-alert-amber" : "dark-alert-teal"} mb-4`} type={Number(adjustmentAmount) < 0 ? "warning" : "info"} showIcon message={t("finance.adjustment_help_title")} description={t("finance.adjustment_help_desc")} />
                <Form form={adjustmentForm} layout="vertical" onFinish={handleAdjustment}>
                    <Form.Item name="amount" label={t("finance.adjustment_amount")} extra={adjustmentAmount ? t("finance.adjustment_balance_preview", { current: formatCurrency(adjustmentAccount?.balance || 0), next: formatCurrency(Number(adjustmentAccount?.balance || 0) + Number(adjustmentAmount || 0)) }) : t("finance.adjustment_amount_help")} rules={[{ required: true, message: t("validation.required_field") }, { validator: (_, value) => Number(value) !== 0 ? Promise.resolve() : Promise.reject(new Error(t("finance.adjustment_nonzero"))) }]}><InputNumber precision={2} className="w-full" placeholder={t("finance.adjustment_amount_placeholder")} /></Form.Item>
                    <Form.Item name="counterpart_account_id" label={t("finance.adjustment_counterpart")} extra={t("finance.adjustment_counterpart_help")} rules={[{ required: true, message: t("validation.required_field") }]}><Select showSearch optionFilterProp="label" options={counterpartAccounts.map((row) => ({ value: row._id, label: `${row.code} · ${row.name}` }))} placeholder={t("finance.adjustment_counterpart_placeholder")} /></Form.Item>
                    <Form.Item name="adjustment_date" label={t("finance.adjustment_date")} rules={[{ required: true, message: t("validation.required_field") }]}><DatePicker className="w-full" /></Form.Item>
                    <Form.Item name="reason" label={t("finance.adjustment_reason")} rules={[{ required: true, whitespace: true, message: t("validation.required_field") }]}><Input.TextArea rows={3} maxLength={300} showCount placeholder={t("finance.adjustment_reason_placeholder")} /></Form.Item>
                </Form>
            </Modal>
            <Modal
                title={t(equityModal?.type === "contribution" ? "finance.capital_contribution_title" : "finance.equity_distribution_title")}
                open={Boolean(equityModal)}
                onCancel={() => setEquityModal(null)}
                onOk={() => equityForm.submit()}
                confirmLoading={equitySubmitting}
                okText={t(equityModal?.type === "contribution" ? "finance.capital_contribution_confirm" : "finance.equity_distribution_confirm")}
                destroyOnHidden
            >
                <Alert
                    className="dark-alert dark-alert-teal mb-4"
                    type="info"
                    showIcon
                    message={t(equityModal?.type === "contribution" ? "finance.capital_contribution_help_title" : "finance.equity_distribution_help_title")}
                    description={t(equityModal?.type === "contribution" ? "finance.capital_contribution_help_desc" : "finance.equity_distribution_help_desc")}
                />
                <Form form={equityForm} layout="vertical" onFinish={handleEquitySubmit}>
                    <Form.Item name="amount" label={t("finance.amount_label")} rules={[{ required: true, message: t("validation.required_field") }]}><InputNumber min={0.01} precision={2} className="w-full" /></Form.Item>
                    <Form.Item name="cash_account_id" label={t("finance.cash_account_label")} rules={[{ required: true, message: t("validation.required_field") }]}><Select showSearch optionFilterProp="label" options={accounts.filter((row) => row.is_active).map((row) => ({ value: row._id, label: `${row.name} · ${formatCurrency(row.balance)}` }))} placeholder={t("finance.cash_account_placeholder")} /></Form.Item>
                    <Form.Item name="date" label={t("finance.col_date")} rules={[{ required: true, message: t("validation.required_field") }]}><DatePicker className="w-full" /></Form.Item>
                    <Form.Item name="description" label={t("finance.transfer_description")}><Input maxLength={200} /></Form.Item>
                </Form>
            </Modal>
            <Drawer width={680} open={Boolean(historyAccount)} onClose={() => setHistoryAccount(null)} title={t("finance.mapping_history_title", { name: historyAccount?.name || "" })} styles={{ body: { background: "var(--ohnix-surface-card-soft)" }, header: { background: "var(--ohnix-surface-card-soft)", borderBottom: "1px solid var(--ohnix-line-3)" } }}>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.mapping_history_help_title")} description={t("finance.mapping_history_help_desc")} />
                <Table loading={historyLoading} className="module-dark-table" size="small" rowKey="_id" dataSource={historyRows} pagination={false} locale={{ emptyText: t("finance.mapping_history_empty") }} scroll={{ x: 600 }} columns={[{ title: t("finance.mapping_history_date"), dataIndex: "created_at", width: 145, render: (value) => dayjs(value).format("DD/MM/YYYY HH:mm") }, { title: t("finance.mapping_history_actor"), dataIndex: ["actor", "name"], ellipsis: true }, { title: t("finance.mapping_history_before"), dataIndex: "before", render: (value) => value ? `${value.code} · ${value.name}` : t("finance.chart_account_automatic") }, { title: t("finance.mapping_history_after"), dataIndex: "after", render: (value) => value ? `${value.code} · ${value.name}` : t("finance.chart_account_automatic") }]} />
            </Drawer>
        </div>
    );
};

export default Finance;
