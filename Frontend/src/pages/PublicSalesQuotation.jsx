import { useEffect, useState } from "react";
import { Alert, Card, Descriptions, Spin, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, FileTextOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { api } from "../api/api.js";
import useI18n from "../hooks/useI18n";
import { useCurrency } from "../context/CurrencyContext";

const { Title, Text } = Typography;

const PublicSalesQuotation = () => {
    const { token } = useParams();
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [quotation, setQuotation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [responding, setResponding] = useState(false);

    useEffect(() => {
        api.get(`/public/sales-quotations/${token}`)
            .then((response) => setQuotation(response.data?.data || null))
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, [token]);

    const respond = async (status) => {
        setResponding(true);
        try {
            const response = await api.post(`/public/sales-quotations/${token}/respond`, { status });
            setQuotation((current) => ({ ...current, status: response.data.data.status }));
        } catch (_) {
            setError(true);
        } finally {
            setResponding(false);
        }
    };

    if (loading) return <div className="flex min-h-screen items-center justify-center bg-[var(--ohnix-bg)]"><Spin size="large" /></div>;
    if (error || !quotation) return <div className="flex min-h-screen items-center justify-center bg-[var(--ohnix-bg)] p-6"><Alert message={t("sales_quotations.public_unavailable")} type="error" /></div>;

    const columns = [
        { title: t("sales_quotations.product"), key: "product", render: (_, detail) => detail.product_id?.product_name || t("common.na") },
        { title: t("common.quantity"), dataIndex: "quantity", key: "quantity" },
        { title: t("sales_quotations.unit_price"), dataIndex: "unit_price", key: "unit_price", render: (value) => formatCurrency(value) },
        { title: t("common.total"), dataIndex: "line_total", key: "line_total", render: (value) => formatCurrency(value) },
    ];

    return (
        <main className="min-h-screen bg-[var(--ohnix-bg)] px-4 py-8 text-[var(--ohnix-text-primary)] sm:px-6 lg:py-14">
            <div className="mx-auto max-w-4xl">
                <div className="mb-8 flex items-start justify-between gap-4">
                    <div>
                        <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#29D8D5]"><FileTextOutlined /> OHNIX</div>
                        <Title level={1} className="!mb-2 !text-[var(--ohnix-text-primary)]">{t("sales_quotations.public_title")}</Title>
                        <Text className="text-[var(--ohnix-text-muted)]">#{quotation.quotation_no}</Text>
                    </div>
                    <Tag icon={<CheckCircleOutlined />} color={quotation.status === "viewed" ? "blue" : "green"}>{t(`sales_quotations.status_${quotation.status}`)}</Tag>
                </div>
                <Card className="mb-5 border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]">
                    <Descriptions column={{ xs: 1, sm: 2 }}>
                        <Descriptions.Item label={t("sales_quotations.customer")}>{quotation.customer?.name}</Descriptions.Item>
                        <Descriptions.Item label={t("sales_quotations.issued")}>{new Date(quotation.issued_at).toLocaleDateString()}</Descriptions.Item>
                        <Descriptions.Item label={t("sales_quotations.valid_until")}>{quotation.valid_until ? new Date(quotation.valid_until).toLocaleDateString() : "-"}</Descriptions.Item>
                        <Descriptions.Item label={t("sales_quotations.customer_email")}>{quotation.customer?.email}</Descriptions.Item>
                    </Descriptions>
                </Card>
                <Card className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]" title={t("sales_quotations.products_title")}>
                    <Table columns={columns} dataSource={quotation.details || []} rowKey="_id" pagination={false} scroll={{ x: 560 }} />
                    <div className="mt-6 ml-auto max-w-xs border-t border-[var(--ohnix-line-4)] pt-3 text-sm">
                        <div className="flex justify-between py-1"><span>{t("sales_quotations.subtotal")}</span><strong>{formatCurrency(quotation.subtotal)}</strong></div>
                        <div className="flex justify-between py-1"><span>{t("sales_quotations.discount")}</span><strong>{formatCurrency(quotation.discount)}</strong></div>
                        <div className="flex justify-between py-1"><span>{t("sales_quotations.tax")}</span><strong>{formatCurrency(quotation.tax)}</strong></div>
                        <div className="mt-2 flex justify-between border-t-2 border-[#29D8D5] pt-3 text-lg"><span>{t("common.total")}</span><strong>{formatCurrency(quotation.total)}</strong></div>
                    </div>
                    {quotation.notes && <div className="mt-6 border-t border-[var(--ohnix-line-4)] pt-4"><Text strong>{t("sales_quotations.notes")}</Text><p className="mt-2 whitespace-pre-wrap text-sm text-[var(--ohnix-text-muted)]">{quotation.notes}</p></div>}
                    {["sent", "viewed"].includes(quotation.status) && <div className="mt-6 flex flex-col gap-3 border-t border-[var(--ohnix-line-4)] pt-5 sm:flex-row sm:justify-end"><button type="button" disabled={responding} onClick={() => respond("rejected")} className="rounded-lg border border-red-400/40 px-4 py-2 text-sm text-red-400 disabled:opacity-50">{t("sales_quotations.reject")}</button><button type="button" disabled={responding} onClick={() => respond("accepted")} className="rounded-lg bg-[#29D8D5] px-4 py-2 text-sm font-semibold text-[#021314] disabled:opacity-50">{t("sales_quotations.accept")}</button></div>}
                </Card>
            </div>
        </main>
    );
};

export default PublicSalesQuotation;
