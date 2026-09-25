import { useEffect, useState } from "react";
import { Select, Empty } from "antd";
import { FileSearchOutlined } from "@ant-design/icons";
import { useSearchParams } from "react-router-dom";
import PageHeader from "../components/common/PageHeader";
import BankReconciliationPanel from "../components/finance/BankReconciliationPanel";
import { financeService } from "../services/financeService";
import { useCurrency } from "../context/CurrencyContext";
import useI18n from "../hooks/useI18n";

// Fase 7 - dedicated full page for bank reconciliation, reachable from a
// "Conciliar" button on each cash account card in Finance.jsx, or from the
// "Ir a conciliación bancaria" button in CashAccountMovementsDrawer.jsx.
// Both pass `?account=<id>` so the account is preselected; opening the page
// directly just shows the account picker.
const BankReconciliation = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [searchParams, setSearchParams] = useSearchParams();
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const accountId = searchParams.get("account") || undefined;

    useEffect(() => {
        financeService.listCashAccounts()
            .then((res) => setAccounts((res?.data || []).filter((row) => row.is_active)))
            .finally(() => setLoading(false));
    }, []);

    const selectedAccount = accounts.find((row) => row._id === accountId) || null;

    const handleSelect = (value) => {
        setSearchParams(value ? { account: value } : {});
    };

    return (
        <div className="min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
            <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <div className="space-y-6">
                    <PageHeader
                        title={t("finance.reconciliation_page_title")}
                        subtitle={t("finance.reconciliation_page_subtitle")}
                        icon={<FileSearchOutlined />}
                        actionButton={
                            <Select
                                loading={loading}
                                showSearch
                                optionFilterProp="label"
                                className="w-full sm:w-80"
                                size="large"
                                placeholder={t("finance.reconciliation_account_placeholder")}
                                value={accountId}
                                onChange={handleSelect}
                                options={accounts.map((row) => ({ value: row._id, label: `${row.name} · ${formatCurrency(row.balance)}` }))}
                            />
                        }
                    />

                    {selectedAccount ? (
                        <BankReconciliationPanel account={selectedAccount} />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-16 text-center gap-2 rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)]">
                            <Empty description={t("finance.reconciliation_pick_account")} />
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default BankReconciliation;
