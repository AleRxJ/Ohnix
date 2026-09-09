import { useEffect, useState } from "react";
import { Alert, Spin, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, FileTextOutlined } from "@ant-design/icons";
import { useParams } from "react-router-dom";
import { api } from "../api/api.js";
import useI18n from "../hooks/useI18n";
import { useCurrency } from "../context/CurrencyContext";
import ThemeToggle from "../components/common/ThemeToggle";
import LanguageSwitcher from "../components/LanguageSwitcher/LanguageSwitcher";

const { Title, Text } = Typography;

const PublicSalesQuotation = () => {
    const { token } = useParams();
    const { t, currentLanguage } = useI18n();
    const { formatCurrency } = useCurrency();
    const [quotation, setQuotation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [responding, setResponding] = useState(false);
    const formatDateTime = (value) => value
        ? new Date(value).toLocaleString(currentLanguage === "en" ? "en-US" : "es-CO", {
            dateStyle: "medium",
            timeStyle: "short",
        })
        : "-";

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
    if (error || !quotation) return <div className="public-sales-quotation-loading p-6"><Alert className="dark-alert dark-alert-rose" message={t("sales_quotations.public_unavailable")} type="error" showIcon /></div>;

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
                        <div className="public-sales-quotation-brand"><img src="/Ohnix_Icon_Transparent.png" alt="Ohnix" className="ohnix-logo-adaptive" /><span>OHNIX</span></div>
                        <p className="public-sales-quotation-eyebrow"><FileTextOutlined /> {t("sales_quotations.public_title")}</p>
                        <Title level={1}>{t("sales_quotations.public_title")}</Title>
                        <p className="public-sales-quotation-number">{t("sales_quotations.number")}: <strong>#{quotation.quotation_no}</strong></p>
                    </div>
                    <div className="public-sales-quotation-header-tools">
                        <div className="public-sales-quotation-preferences"><LanguageSwitcher /><ThemeToggle compact /></div>
                        <Tag icon={<CheckCircleOutlined />} className="public-sales-quotation-status" color={quotation.status === "viewed" ? "blue" : "green"}>{t(`sales_quotations.status_${quotation.status}`)}</Tag>
                    </div>
                </header>

                <section className="public-sales-quotation-meta">
                    <div><span>{t("sales_quotations.customer")}</span><strong>{quotation.customer?.name}</strong><small>{quotation.customer?.email}</small></div>
                    <div><span>{t("sales_quotations.issued_by")}</span><strong>{quotation.point_of_sale?.account?.company?.legalName || quotation.point_of_sale?.account?.company?.name || "Ohnix"}</strong><small>{quotation.point_of_sale?.name ? `${t("sales_quotations.point_of_sale")}: ${quotation.point_of_sale.name}` : t("sales_quotations.quotation_prepared")}</small><small>{quotation.point_of_sale?.account?.company?.contactEmail || quotation.point_of_sale?.account?.company?.phone || ""}</small></div>
                    <div><span>{t("sales_quotations.issued")}</span><strong>{formatDateTime(quotation.issued_at)}</strong></div>
                    <div><span>{t("sales_quotations.valid_until")}</span><strong>{formatDateTime(quotation.valid_until)}</strong></div>
                </section>

                <section className="public-sales-quotation-lines">
                    <div className="public-sales-quotation-section-heading"><div><div><h2>{t("sales_quotations.public_detail_title")}</h2><p>{t("sales_quotations.products_hint")}</p></div></div></div>
                    <Table columns={columns} dataSource={quotation.details || []} rowKey="_id" pagination={false} scroll={{ x: 560 }} />
                </section>

                <section className="public-sales-quotation-total-area">
                    <div className="public-sales-quotation-notes">{quotation.notes && <><span>{t("sales_quotations.notes")}</span><p>{quotation.notes}</p></>}</div>
                    <div className="public-sales-quotation-totals">
                        <div><span>{t("sales_quotations.subtotal")}</span><strong>{formatCurrency(quotation.subtotal)}</strong></div>
                        <div><span>{t("sales_quotations.discount")}</span><strong>- {formatCurrency(quotation.discount)}</strong></div>
                        <div><span>{t("sales_quotations.vat")}</span><strong>{formatCurrency(quotation.tax)}</strong></div>
                        <div className="grand-total"><span>{t("common.total")}</span><strong>{formatCurrency(quotation.total)}</strong></div>
                    </div>
                    <p className="public-sales-quotation-tax-note">{t("sales_quotations.vat_hint")}</p>
                </section>

                {["sent", "viewed"].includes(quotation.status) && <footer className="public-sales-quotation-response"><div><strong>{t("sales_quotations.response_title")}</strong><span>{t("sales_quotations.response_hint")}</span></div><div className="public-sales-quotation-actions"><button type="button" disabled={responding} onClick={() => respond("rejected")}>{t("sales_quotations.reject")}</button><button type="button" disabled={responding} onClick={() => respond("accepted")}>{t("sales_quotations.accept")}</button></div></footer>}
                <footer className="public-sales-quotation-footer">{t("sales_quotations.footer_note")}</footer>
            </article>
        </main>
    );
};

export default PublicSalesQuotation;
