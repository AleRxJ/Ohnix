import { useEffect, useState } from "react";
import { Alert, Spin, Table, Tag, Typography } from "antd";
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

    if (loading) return <div className="public-sales-quotation-loading"><Spin size="large" /></div>;
    if (error || !quotation) return <div className="public-sales-quotation-loading p-6"><Alert message={t("sales_quotations.public_unavailable")} type="error" /></div>;

    const columns = [
        { title: t("sales_quotations.product"), key: "product", render: (_, detail) => detail.product_id?.product_name || t("common.na") },
        { title: t("common.quantity"), dataIndex: "quantity", key: "quantity" },
        { title: t("sales_quotations.unit_price"), dataIndex: "unit_price", key: "unit_price", render: (value) => formatCurrency(value) },
        { title: t("common.total"), dataIndex: "line_total", key: "line_total", render: (value) => formatCurrency(value) },
    ];

    return (
        <main className="public-sales-quotation">
            <article className="public-sales-quotation-document">
                <header className="public-sales-quotation-hero">
                    <div>
                        <img src="/Ohnix_FullLogo.svg" alt="Ohnix" className="public-sales-quotation-logo" />
                        <p className="public-sales-quotation-eyebrow"><FileTextOutlined /> {t("sales_quotations.public_title")}</p>
                        <Title level={1}>{t("sales_quotations.public_title")}</Title>
                        <p className="public-sales-quotation-number">{t("sales_quotations.number")}: <strong>#{quotation.quotation_no}</strong></p>
                    </div>
                    <Tag icon={<CheckCircleOutlined />} className="public-sales-quotation-status" color={quotation.status === "viewed" ? "blue" : "green"}>{t(`sales_quotations.status_${quotation.status}`)}</Tag>
                </header>

                <section className="public-sales-quotation-meta">
                    <div><span>{t("sales_quotations.customer")}</span><strong>{quotation.customer?.name}</strong><small>{quotation.customer?.email}</small></div>
                    <div><span>{t("sales_quotations.issued")}</span><strong>{new Date(quotation.issued_at).toLocaleDateString()}</strong></div>
                    <div><span>{t("sales_quotations.valid_until")}</span><strong>{quotation.valid_until ? new Date(quotation.valid_until).toLocaleDateString() : "-"}</strong></div>
                </section>

                <section className="public-sales-quotation-lines">
                    <div className="public-sales-quotation-section-heading"><div><span>01</span><div><h2>{t("sales_quotations.products_title")}</h2><p>{t("sales_quotations.products_hint")}</p></div></div></div>
                    <Table columns={columns} dataSource={quotation.details || []} rowKey="_id" pagination={false} scroll={{ x: 560 }} />
                </section>

                <section className="public-sales-quotation-total-area">
                    <div className="public-sales-quotation-notes">{quotation.notes && <><span>{t("sales_quotations.notes")}</span><p>{quotation.notes}</p></>}</div>
                    <div className="public-sales-quotation-totals">
                        <div><span>{t("sales_quotations.subtotal")}</span><strong>{formatCurrency(quotation.subtotal)}</strong></div>
                        <div><span>{t("sales_quotations.discount")}</span><strong>- {formatCurrency(quotation.discount)}</strong></div>
                        <div><span>{t("sales_quotations.tax")}</span><strong>{formatCurrency(quotation.tax)}</strong></div>
                        <div className="grand-total"><span>{t("common.total")}</span><strong>{formatCurrency(quotation.total)}</strong></div>
                    </div>
                </section>

                {["sent", "viewed"].includes(quotation.status) && <footer className="public-sales-quotation-response"><div><strong>{t("sales_quotations.response_title")}</strong><span>{t("sales_quotations.response_hint")}</span></div><div className="public-sales-quotation-actions"><button type="button" disabled={responding} onClick={() => respond("rejected")}>{t("sales_quotations.reject")}</button><button type="button" disabled={responding} onClick={() => respond("accepted")}>{t("sales_quotations.accept")}</button></div></footer>}
                <footer className="public-sales-quotation-footer">{t("sales_quotations.footer_note")}</footer>
            </article>
        </main>
    );
};

export default PublicSalesQuotation;
