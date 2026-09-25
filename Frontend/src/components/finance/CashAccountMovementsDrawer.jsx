import { Drawer, Table, Tag, Button, Spin } from "antd";
import { CloseOutlined, FileSearchOutlined, WalletOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { useNavigate } from "react-router-dom";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { useCashAccountMovements } from "../../hooks/finance/useCashAccounts";
import useIsMobile from "../../hooks/useIsMobile";

const SOURCE_LABEL_KEYS = {
    order_payment: "finance.source_order_payment",
    purchase_payment: "finance.source_purchase_payment",
    manual_deposit: "finance.source_manual_deposit",
    manual_withdrawal: "finance.source_manual_withdrawal",
    transfer_out: "finance.source_transfer_out",
    transfer_in: "finance.source_transfer_in",
    adjustment: "finance.source_adjustment",
    tax_payment: "finance.source_tax_payment",
    prepaid_expense: "finance.source_prepaid_expense",
    loan_disbursement: "finance.source_loan_disbursement",
    loan_payment: "finance.source_loan_payment",
};

// Fase 7 - the reconciliation section (import, manual entry, unmatched
// entries, suggestions, report) moved out to BankReconciliationPanel.jsx,
// rendered on its own dedicated page (Frontend/src/pages/BankReconciliation.jsx)
// instead of being cramped in here. This Drawer is now just the ledger.
const CashAccountMovementsDrawer = ({ visible, onClose, account }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const isMobile = useIsMobile();
    const navigate = useNavigate();
    const { movements, loading } = useCashAccountMovements(account?._id);

    if (!account) return null;

    const goToReconciliation = () => {
        onClose();
        navigate(`/finance/reconciliation?account=${account._id}`);
    };

    const movementColumns = [
        {
            title: t("finance.col_date"),
            dataIndex: "createdAt",
            key: "createdAt",
            render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm"),
            width: 140,
        },
        {
            title: t("finance.col_amount"),
            dataIndex: "delta",
            key: "delta",
            align: "right",
            render: (v) => (
                <span className={v >= 0 ? "text-[var(--ohnix-status-success)] font-medium" : "text-[var(--ohnix-status-danger)] font-medium"}>
                    {v >= 0 ? "+" : ""}
                    {formatCurrency(v)}
                </span>
            ),
        },
        {
            title: t("finance.col_balance_after"),
            dataIndex: "balance_after",
            key: "balance_after",
            align: "right",
            render: (v) => formatCurrency(v),
        },
        {
            title: t("finance.col_source"),
            dataIndex: "source_type",
            key: "source_type",
            render: (v) => t(SOURCE_LABEL_KEYS[v] || v),
        },
        {
            title: t("finance.col_reason"),
            dataIndex: "reason",
            key: "reason",
            ellipsis: true,
            render: (v) => v || t("common.na"),
        },
        {
            title: t("finance.col_reconciled"),
            dataIndex: "reconciled_at",
            key: "reconciled_at",
            render: (v) =>
                v ? (
                    <Tag color="green">{t("finance.reconciled_yes")}</Tag>
                ) : (
                    <Tag color="default" className="!bg-[var(--ohnix-line-1)] !border-[var(--ohnix-line-4)] !text-[var(--ohnix-text-muted)]">
                        {t("finance.reconciled_no")}
                    </Tag>
                ),
        },
    ];

    return (
        <Drawer
            title={
                <div className="text-center w-full">
                    <span className="text-xl font-bold tracking-wide uppercase text-[var(--ohnix-text-primary)]">
                        {t("finance.movements_drawer_title", { name: account.name })}
                    </span>
                </div>
            }
            placement="right"
            onClose={onClose}
            open={visible}
            width={isMobile ? "100vw" : 640}
            closeIcon={<CloseOutlined className="text-[var(--ohnix-text-muted)]" />}
            styles={{
                mask: { backgroundColor: "var(--ohnix-modal-mask)" },
                body: { padding: isMobile ? 16 : 24, background: "var(--ohnix-surface-card-soft)" },
                header: { borderBottom: "1px solid var(--ohnix-line-3)", padding: isMobile ? "16px" : "20px 24px", background: "var(--ohnix-surface-card-soft)" },
            }}
        >
            <div className="space-y-4 sm:space-y-6">
                <div className="rounded-2xl p-4 border border-[var(--ohnix-line-4)] flex items-center justify-between bg-[var(--ohnix-line-1)]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)]">
                            <WalletOutlined className="text-lg text-[var(--ohnix-accent-2)]" />
                        </div>
                        <span className="font-semibold text-[var(--ohnix-text-primary)]">{account.name}</span>
                    </div>
                    <span className="text-xl font-bold text-[var(--ohnix-accent-2)]">{formatCurrency(account.balance)}</span>
                </div>

                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-medium text-[var(--ohnix-text-muted)] uppercase tracking-wide m-0">
                            {t("finance.ledger_title")}
                        </h3>
                        <Button icon={<FileSearchOutlined />} onClick={goToReconciliation}>{t("finance.go_to_reconciliation_cta")}</Button>
                    </div>
                    {loading ? (
                        <div className="text-center py-12">
                            <Spin size="large" />
                        </div>
                    ) : movements.length > 0 ? (
                        <Table
                            className="module-dark-table"
                            dataSource={movements}
                            columns={movementColumns}
                            pagination={{ pageSize: 10 }}
                            rowKey="_id"
                            size="small"
                            scroll={{ x: 600 }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                            <span className="text-sm text-[var(--ohnix-text-muted)]">{t("finance.no_movements")}</span>
                        </div>
                    )}
                </div>
            </div>
        </Drawer>
    );
};

export default CashAccountMovementsDrawer;
