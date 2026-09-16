import { useEffect, useState } from "react";
import { Alert, Card, Table } from "antd";
import dayjs from "dayjs";
import { financeService } from "../../services/financeService";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";

export default function PaymentCreditsPanel({ payable = false }) {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [credits, setCredits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    useEffect(() => {
        let mounted = true;
        financeService.listPaymentCredits().then((response) => {
            if (mounted) setCredits((response?.data || []).filter((credit) => payable ? Boolean(credit.supplierId) : Boolean(credit.customerId)));
        }).catch(() => { if (mounted) setError(true); }).finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, [payable]);
    return <Card className="module-shell border border-[var(--ohnix-line-4)] mt-4" title={t("finance.payment_credits_title")}>
        <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.payment_credits_help")} />
        {error ? <Alert type="error" showIcon message={t("finance.payment_credits_load_failed")} /> : <Table className="module-dark-table" rowKey="id" loading={loading} dataSource={credits} pagination={{ pageSize: 8 }} columns={[
            { title: payable ? t("finance.payables_supplier") : t("finance.receivables_customer"), render: (_, credit) => payable ? credit.supplier?.name || "—" : credit.customer?.name || "—" },
            { title: t("finance.payment_date"), dataIndex: "createdAt", render: (value) => value ? dayjs(value).format("DD/MM/YYYY") : "—" },
            { title: t("finance.payment_amount"), dataIndex: "amount", align: "right", render: (value) => formatCurrency(Number(value || 0)) },
            { title: t("finance.payment_allocated"), dataIndex: "appliedAmount", align: "right", render: (value) => formatCurrency(Number(value || 0)) },
            { title: t("finance.payment_available"), align: "right", render: (_, credit) => formatCurrency(Math.max(Number(credit.amount || 0) - Number(credit.appliedAmount || 0), 0)) },
        ]} locale={{ emptyText: t("finance.payment_credits_empty") }} />}
    </Card>;
}
