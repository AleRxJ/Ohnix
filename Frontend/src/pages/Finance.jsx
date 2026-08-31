import { useEffect, useState } from "react";
import { Button, Form, Spin, Popconfirm, Tooltip } from "antd";
import { PlusOutlined, WalletOutlined, BankOutlined, EditOutlined, StopOutlined, UnorderedListOutlined } from "@ant-design/icons";
import PageHeader from "../components/common/PageHeader";
import CashAccountFormModal from "../components/finance/CashAccountFormModal";
import CashAccountMovementsDrawer from "../components/finance/CashAccountMovementsDrawer";
import { useCashAccounts } from "../hooks/finance/useCashAccounts";
import { pointOfSaleService } from "../services/pointOfSaleService";
import { useCurrency } from "../context/CurrencyContext";
import { useTeam } from "../context/TeamContext";
import useI18n from "../hooks/useI18n";
import AccountsPayablePlanner from "../components/finance/AccountsPayablePlanner";

const ACCOUNT_TYPE_ICON = { cash: WalletOutlined, bank: BankOutlined };

const Finance = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("finance", "edit");
    const { accounts, loading, submitting, createAccount, updateAccount, deactivateAccount } = useCashAccounts();
    const [pointsOfSale, setPointsOfSale] = useState([]);
    const [modal, setModal] = useState(null); // { mode: "create" | "edit", record? }
    const [movementsAccount, setMovementsAccount] = useState(null);
    const [form] = Form.useForm();

    useEffect(() => {
        pointOfSaleService
            .list()
            .then((res) => setPointsOfSale((res?.data || []).filter((pos) => pos.isActive)))
            .catch(() => {});
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
                  })
                : await updateAccount(modal.record._id, {
                      name: values.name.trim(),
                      bank_name: values.bank_name,
                      account_number: values.account_number,
                  });
        if (success) closeModal();
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
                                                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[linear-gradient(135deg,rgba(41,216,213,0.18),rgba(68,243,240,0.06))] shadow-[0_0_18px_rgba(41,216,213,0.12)]">
                                                    <Icon className="text-lg text-[#44F3F0]" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="m-0 font-semibold text-[var(--ohnix-text-primary)] truncate">{record.name}</p>
                                                    <span className="text-xs text-[var(--ohnix-text-muted)]">
                                                        {record.point_of_sale?.name || t("finance.point_of_sale_all_locations")}
                                                    </span>
                                                </div>
                                            </div>
                                            {record.is_active ? (
                                                <span className="status-pill" style={{ color: "#22c55e", background: "#22c55e18", border: "1px solid #22c55e33" }}>
                                                    <span className="status-dot" style={{ background: "#22c55e" }} />
                                                    {t("finance.status_active")}
                                                </span>
                                            ) : (
                                                <span className="status-pill" style={{ color: "#8b98a0", background: "#8b98a018", border: "1px solid #8b98a033" }}>
                                                    <span className="status-dot" style={{ background: "#8b98a0" }} />
                                                    {t("finance.status_inactive")}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center justify-between border-t border-[var(--ohnix-line-3)] pt-3">
                                            <span className="text-xs text-[var(--ohnix-text-muted)] uppercase tracking-wide">{t("finance.balance_label")}</span>
                                            <span className="text-lg font-bold text-[#44F3F0]">{formatCurrency(record.balance)}</span>
                                        </div>

                                        <div className="flex gap-2 pt-1">
                                            <Button
                                                icon={<UnorderedListOutlined />}
                                                onClick={() => setMovementsAccount(record)}
                                                className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-soft)] hover:text-[#44F3F0] hover:border-[#44F3F0] hover:bg-[rgba(41,216,213,0.06)] transition-all duration-200"
                                            >
                                                {t("finance.view_movements")}
                                            </Button>
                                            {canEdit && (
                                                <Button
                                                    icon={<EditOutlined />}
                                                    onClick={() => openEdit(record)}
                                                    className="h-9 w-9 flex items-center justify-center rounded-lg bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-soft)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-all duration-200"
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
                                                        className="h-9 w-9 flex items-center justify-center rounded-lg bg-[rgba(251,113,133,0.06)] border border-[rgba(251,113,133,0.25)] text-[var(--ohnix-status-rose)] hover:bg-[rgba(251,113,133,0.14)] hover:border-[var(--ohnix-status-rose)] transition-all duration-200"
                                                    />
                                                </Popconfirm>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <AccountsPayablePlanner canEdit={canEdit} />
                </div>
            </div>

            <CashAccountFormModal
                open={Boolean(modal)}
                mode={modal?.mode}
                form={form}
                pointsOfSale={pointsOfSale}
                submitting={submitting}
                onCancel={closeModal}
                onSubmit={handleSubmit}
            />

            <CashAccountMovementsDrawer
                visible={Boolean(movementsAccount)}
                onClose={() => setMovementsAccount(null)}
                account={movementsAccount}
            />
        </div>
    );
};

export default Finance;
