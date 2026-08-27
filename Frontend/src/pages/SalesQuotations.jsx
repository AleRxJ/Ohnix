import { useEffect, useMemo, useState } from "react";
import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, Tooltip, Typography, Popconfirm } from "antd";
import { EyeOutlined, FileTextOutlined, PlusOutlined, PrinterOutlined, SendOutlined, ShareAltOutlined, TagsOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import { api } from "../api/api.js";
import useI18n from "../hooks/useI18n";
import { useCurrency } from "../context/CurrencyContext";
import { printSalesQuotation } from "../utils/printSalesQuotation.js";
import PointOfSaleField from "../components/common/PointOfSaleField";

const { Title, Text } = Typography;

const SalesQuotations = () => {
    const { t, currentLanguage } = useI18n();
    const { formatCurrency, currency } = useCurrency();
    const [quotations, setQuotations] = useState([]);
    const [customers, setCustomers] = useState([]);
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [detailQuotation, setDetailQuotation] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState("all");
    const [form] = Form.useForm();

    const loadData = async () => {
        setLoading(true);
        try {
            const [quotationResponse, customerResponse, productResponse] = await Promise.all([
                api.get("/sales-quotations"),
                api.get("/customers"),
                api.get("/products"),
            ]);
            setQuotations(quotationResponse.data?.data || []);
            setCustomers(customerResponse.data?.data || []);
            setProducts(productResponse.data?.data || []);
        } catch {
            toast.error(t("sales_quotations.load_failed"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
        // loadData is intentionally local to this page and only runs on mount.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const visibleQuotations = useMemo(() => {
        const normalizedSearch = search.toLowerCase();
        return quotations.filter((quotation) =>
            `${quotation.quotation_no} ${quotation.customer?.name || ""}`.toLowerCase().includes(normalizedSearch) &&
            (statusFilter === "all" || quotation.status === statusFilter)
        );
    }, [quotations, search, statusFilter]);

    const stats = {
        total: quotations.length,
        draft: quotations.filter((quotation) => quotation.status === "draft").length,
        sent: quotations.filter((quotation) => ["sent", "viewed"].includes(quotation.status)).length,
        accepted: quotations.filter((quotation) => quotation.status === "accepted").length,
    };

    const handleOpen = () => {
        form.resetFields();
        form.setFieldsValue({ discount_mode: "percentage", discount_rate: 0, discount_value: 0, details: [{ quantity: 1, discount_rate: 0 }] });
        setModalOpen(true);
    };

    const handleSubmit = async (values) => {
        setSubmitting(true);
        try {
            const response = await api.post("/sales-quotations", {
                quotation_no: values.quotation_no,
                customer_id: values.customer_id,
                pointOfSaleId: values.pointOfSaleId,
                valid_until: values.valid_until || undefined,
                notes: values.notes,
                discount_mode: values.discount_mode || "percentage",
                discount_rate: values.discount_rate || 0,
                discount_value: values.discount_value || 0,
                details: values.details.map((detail) => ({
                    product_id: detail.product_id,
                    quantity: detail.quantity,
                    unit_price: detail.unit_price,
                    discount_rate: detail.discount_rate || 0,
                })),
            });
            if (response.data?.success) {
                toast.success(t("sales_quotations.created"));
                setModalOpen(false);
                await loadData();
            }
        } catch {
            toast.error(t("sales_quotations.create_failed"));
        } finally {
            setSubmitting(false);
        }
    };

    const handleWhatsApp = (quotation) => {
        const phone = `${quotation.customer?.phone || ""}`.replace(/\D/g, "");
        if (!phone) {
            toast.error(t("sales_quotations.customer_phone_missing"));
            return;
        }
        const message = t("sales_quotations.whatsapp_message", {
            number: quotation.quotation_no,
            total: formatCurrency(quotation.total),
            url: `${window.location.origin}/public/sales-quotations/${quotation.public_token}`,
        });
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
    };

    const handleSendEmail = async (quotation) => {
        try {
            await api.post(`/sales-quotations/${quotation._id}/send`);
            toast.success(t("sales_quotations.sent"));
            await loadData();
        } catch {
            toast.error(t("sales_quotations.send_failed"));
        }
    };

    const handleConvert = async (quotation) => {
        try {
            await api.post(`/sales-quotations/${quotation._id}/convert`);
            toast.success(t("sales_quotations.converted"));
            await loadData();
        } catch {
            toast.error(t("sales_quotations.convert_failed"));
        }
    };

    const columns = [
        { title: t("sales_quotations.number"), dataIndex: "quotation_no", key: "quotation_no" },
        { title: t("sales_quotations.customer"), key: "customer", render: (_, record) => record.customer?.name || t("common.na") },
        { title: t("sales_quotations.issued"), key: "issued", render: (_, record) => new Date(record.issued_at).toLocaleDateString() },
        { title: t("sales_quotations.valid_until"), key: "valid_until", render: (_, record) => record.valid_until ? new Date(record.valid_until).toLocaleDateString() : "-" },
        { title: t("common.status"), dataIndex: "status", key: "status", render: (status) => <Tag color={status === "accepted" ? "green" : status === "rejected" ? "red" : "blue"}>{t(`sales_quotations.status_${status}`)}</Tag> },
        { title: t("common.total"), dataIndex: "total", key: "total", render: (value) => formatCurrency(value) },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, quotation) => (
                <Space>
                    <Tooltip title={t("sales_quotations.view_details")}><Button icon={<EyeOutlined />} onClick={() => setDetailQuotation(quotation)} /></Tooltip>
                    <Tooltip title={t("sales_quotations.print")}><Button icon={<PrinterOutlined />} onClick={() => printSalesQuotation({ quotation, formatCurrency, currentLanguage })} /></Tooltip>
                    <Tooltip title={t("sales_quotations.share_whatsapp")}><Button icon={<ShareAltOutlined />} onClick={() => handleWhatsApp(quotation)} /></Tooltip>
                    <Tooltip title={t("sales_quotations.send_email")}><Button icon={<SendOutlined />} onClick={() => handleSendEmail(quotation)} disabled={!quotation.customer?.email || ["accepted", "rejected", "expired", "converted"].includes(quotation.status)} /></Tooltip>
                    {quotation.status === "accepted" && <Popconfirm title={t("sales_quotations.confirm_convert")} onConfirm={() => handleConvert(quotation)}><Tooltip title={t("sales_quotations.convert")}><Button icon={<FileTextOutlined />} /></Tooltip></Popconfirm>}
                </Space>
            ),
        },
    ];

    return (
        <div className="quotation-page sales-quotations-page min-h-screen p-4 text-[var(--ohnix-text-primary)] sm:p-6 lg:p-8">
            <div className="sales-quotations-header flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <Title level={1} className="flex items-center gap-2 !mb-1 !text-4xl !text-[var(--ohnix-text-primary)]"><span>{t("sales_quotations.title")}</span><TagsOutlined className="text-[#44F3F0]" /></Title>
                    <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("sales_quotations.description")}</Text>
                </div>
                <Button type="primary" icon={<PlusOutlined />} size="large" onClick={handleOpen} className="bg-[#29D8D5] text-[#021314]">
                    {t("sales_quotations.new")}
                </Button>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    [t("sales_quotations.total"), stats.total],
                    [t("sales_quotations.status_draft"), stats.draft],
                    [t("sales_quotations.sent_summary"), stats.sent],
                    [t("sales_quotations.status_accepted"), stats.accepted],
                ].map(([label, value]) => (
                    <div key={label} className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] px-4 py-3">
                        <div className="text-[11px] uppercase tracking-[0.12em] text-[var(--ohnix-text-muted)]">{label}</div>
                        <div className="mt-1 text-xl font-semibold text-[var(--ohnix-text-primary)]">{value}</div>
                    </div>
                ))}
            </div>

            <Card className="quotation-table-shell border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <Title level={4} className="!mb-1 !text-[var(--ohnix-text-primary)]">{t("sales_quotations.list_title")}</Title>
                        <Text className="text-xs text-[var(--ohnix-text-muted)]">{t("sales_quotations.list_hint")}</Text>
                    </div>
                    <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
                        <Input.Search value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t("sales_quotations.search")} allowClear className="sm:w-72" />
                        <Select value={statusFilter} onChange={setStatusFilter} options={[
                            { value: "all", label: t("sales_quotations.all_statuses") },
                            { value: "draft", label: t("sales_quotations.status_draft") },
                            { value: "sent", label: t("sales_quotations.status_sent") },
                            { value: "viewed", label: t("sales_quotations.status_viewed") },
                            { value: "accepted", label: t("sales_quotations.status_accepted") },
                            { value: "rejected", label: t("sales_quotations.status_rejected") },
                            { value: "expired", label: t("sales_quotations.status_expired") },
                            { value: "converted", label: t("sales_quotations.status_converted") },
                        ]} className="sm:w-48" />
                    </div>
                </div>
                <Table columns={columns} dataSource={visibleQuotations} rowKey="_id" loading={loading} pagination={{ pageSize: 10 }} scroll={{ x: 760 }} />
            </Card>

            <Modal open={Boolean(detailQuotation)} onCancel={() => setDetailQuotation(null)} footer={null} title={detailQuotation ? `${t("sales_quotations.title")} #${detailQuotation.quotation_no}` : null} className="sales-quotation-modal">
                {detailQuotation && <div className="space-y-4 text-sm">
                    <div className="grid grid-cols-2 gap-3"><div><div className="text-xs text-[var(--ohnix-text-muted)]">{t("sales_quotations.customer")}</div><strong>{detailQuotation.customer?.name || t("common.na")}</strong></div><div><div className="text-xs text-[var(--ohnix-text-muted)]">{t("common.status")}</div><Tag color="blue">{t(`sales_quotations.status_${detailQuotation.status}`)}</Tag></div></div>
                    <Table size="small" pagination={false} rowKey="_id" dataSource={detailQuotation.details || []} columns={[{ title: t("sales_quotations.product"), render: (_, item) => item.product_id?.product_name || t("common.na") }, { title: t("common.quantity"), dataIndex: "quantity" }, { title: t("sales_quotations.unit_price"), dataIndex: "unit_price", render: (value) => formatCurrency(value) }, { title: t("common.total"), dataIndex: "line_total", render: (value) => formatCurrency(value) }]} />
                    <div className="flex justify-end border-t border-[var(--ohnix-line-4)] pt-3 text-lg font-semibold">{t("common.total")}: {formatCurrency(detailQuotation.total)}</div>
                </div>}
            </Modal>

            <Modal title={<span className="text-[var(--ohnix-text-primary)]">{t("sales_quotations.new")}</span>} open={modalOpen} onCancel={() => setModalOpen(false)} footer={null} width={820} className="sales-quotation-modal" rootClassName="sales-quotation-modal">
                <div className="mb-5 rounded-xl border border-[#29D8D5]/20 bg-[#29D8D5]/[0.06] p-3 text-sm text-[var(--ohnix-text-soft)]">
                    {t("sales_quotations.form_intro")}
                </div>
                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                        <PointOfSaleField />
                        <Form.Item label={t("sales_quotations.customer" )} name="customer_id" rules={[{ required: true, message: t("sales_quotations.customer_required") }]}>
                            <Select showSearch optionFilterProp="label" options={customers.map((customer) => ({ value: customer._id || customer.id, label: `${customer.name} · ${customer.email}` }))} placeholder={t("sales_quotations.customer_placeholder")} />
                        </Form.Item>
                        <Form.Item label={t("sales_quotations.number")} name="quotation_no" rules={[{ required: true, message: t("sales_quotations.number_required") }]}>
                            <Input placeholder={t("sales_quotations.number_placeholder")} />
                        </Form.Item>
                        <Form.Item label={t("sales_quotations.valid_until")} name="valid_until" extra={t("sales_quotations.valid_until_hint")}>
                            <Input type="date" />
                        </Form.Item>
                        <Form.Item label={t("sales_quotations.discount_type")} name="discount_mode" initialValue="percentage">
                            <Select options={[{ value: "percentage", label: t("sales_quotations.discount_percentage") }, { value: "fixed", label: t("sales_quotations.discount_fixed") }]} />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(previous, current) => previous.discount_mode !== current.discount_mode}>
                            {({ getFieldValue }) => {
                                const isFixed = getFieldValue("discount_mode") === "fixed";
                                return <Form.Item label={isFixed ? t("sales_quotations.general_discount_fixed") : t("sales_quotations.general_discount_percentage")} name={isFixed ? "discount_value" : "discount_rate"} initialValue={0} extra={t(isFixed ? "sales_quotations.fixed_discount_hint" : "sales_quotations.percentage_discount_hint")}>
                                    <InputNumber min={0} max={isFixed ? undefined : 100} prefix={isFixed ? currency.symbol : undefined} suffix={isFixed ? undefined : "%"} className="w-full" />
                                </Form.Item>;
                            }}
                        </Form.Item>
                    </div>
                    <Form.Item label={t("sales_quotations.notes")} name="notes" extra={t("sales_quotations.notes_hint")}>
                        <Input.TextArea rows={2} placeholder={t("sales_quotations.notes_placeholder")} />
                    </Form.Item>
                    <div className="mb-3 flex items-center justify-between">
                        <div><Text strong className="text-[var(--ohnix-text-primary)]">{t("sales_quotations.products_title")}</Text><div className="text-xs text-[var(--ohnix-text-muted)]">{t("sales_quotations.products_hint")}</div></div>
                        <Form.List name="details">
                            {(fields, { add }) => <Button type="dashed" icon={<PlusOutlined />} onClick={() => add({ quantity: 1, discount_rate: 0 })}>{t("sales_quotations.add_product")}</Button>}
                        </Form.List>
                    </div>
                    <Form.List name="details">
                        {(fields, { remove }) => fields.map(({ key, name, ...restField }) => (
                            <div key={key} className="mb-3 grid grid-cols-1 gap-3 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-2)] p-3 sm:grid-cols-[1.6fr_0.7fr_1fr_0.7fr_auto]">
                                <Form.Item {...restField} name={[name, "product_id"]} label={t("sales_quotations.product")} rules={[{ required: true, message: t("sales_quotations.product_required") }]}><Select showSearch optionFilterProp="label" options={products.map((product) => ({ value: product._id || product.id, label: `${product.product_name} · ${formatCurrency(product.selling_price)}` }))} onChange={(value) => { const product = products.find((item) => (item._id || item.id) === value); if (product) form.setFieldValue(["details", name, "unit_price"], product.selling_price); }} /></Form.Item>
                                <Form.Item {...restField} name={[name, "quantity"]} label={t("common.quantity")} rules={[{ required: true }]}><InputNumber min={1} className="w-full" /></Form.Item>
                                <Form.Item {...restField} name={[name, "unit_price"]} label={t("sales_quotations.unit_price")} rules={[{ required: true }]}><InputNumber min={0} className="w-full" /></Form.Item>
                                <Form.Item {...restField} name={[name, "discount_rate"]} label={t("sales_quotations.product_discount")} extra={t("sales_quotations.product_discount_hint")}><InputNumber min={0} max={100} suffix="%" className="w-full" /></Form.Item>
                                <Button danger type="text" onClick={() => remove(name)} className="self-end">{t("common.delete")}</Button>
                            </div>
                        ))}
                    </Form.List>
                    <Space className="mt-4 flex w-full justify-end">
                        <Button onClick={() => setModalOpen(false)}>{t("common.cancel")}</Button>
                        <Button type="primary" htmlType="submit" loading={submitting} icon={<FileTextOutlined />}>{t("sales_quotations.save")}</Button>
                    </Space>
                </Form>
            </Modal>
        </div>
    );
};

export default SalesQuotations;
