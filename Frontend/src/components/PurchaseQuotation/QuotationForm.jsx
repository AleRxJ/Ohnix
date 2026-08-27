import PropTypes from "prop-types";
import { Modal, Form, Input, Select, Row, Col, Divider, Button, Card, DatePicker } from "antd";
import { PlusOutlined, FileTextOutlined, TagsOutlined } from "@ant-design/icons";
import PurchaseFormItem from "../Purchase/PurchaseFormItem";
import useI18n from "../../hooks/useI18n";
import PointOfSaleField from "../common/PointOfSaleField";

const { Option } = Select;
const { TextArea } = Input;

const sectionCardProps = {
    className: "quotation-section-card",
    headStyle: { borderBottom: "1px solid var(--ohnix-line-3)", background: "transparent" },
};

// Mirrors PurchaseForm.jsx's shape (same Modal chrome, same
// Form.List/PurchaseFormItem for lines) - deliberately without a status
// selector or tax fields, since a quotation has neither until it's approved
// and converted into a real Purchase.
const QuotationForm = ({ visible, onCancel, onSubmit, suppliers, products, form, initialValues, submitting }) => {
    const { t } = useI18n();

    const handleProductChange = (productId, fieldName) => {
        const product = products.find((p) => p._id === productId);
        if (!product) return;
        const details = form.getFieldValue("details");
        if (!details) return;
        details[fieldName] = { ...details[fieldName], product_id: productId, unitcost: product.buying_price };
        form.setFieldsValue({ details });
    };

    const handleSubmit = (values) => {
        onSubmit({
            supplier_id: values.supplier_id,
            pointOfSaleId: values.pointOfSaleId,
            quotation_no: values.quotation_no,
            valid_until: values.valid_until ? values.valid_until.format("YYYY-MM-DD") : undefined,
            notes: values.notes,
            details: values.details.map((detail) => ({
                product_id: detail.product_id,
                quantity: detail.quantity,
                unitcost: detail.unitcost,
            })),
        });
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <TagsOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">{t("quotations.add_new_quotation")}</span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={880}
            centered
            className="purchase-form-modal quotation-form-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: { background: "transparent", borderBottom: "1px solid var(--ohnix-line-3)", padding: "20px 24px 16px" },
                body: { padding: "24px", maxHeight: "75vh", overflowY: "auto" },
            }}
        >
            <Form form={form} layout="vertical" onFinish={handleSubmit} initialValues={initialValues} className="mt-2 space-y-6">
                <Card
                    {...sectionCardProps}
                    title={
                        <div className="flex items-center text-[var(--ohnix-text-primary)]">
                            <FileTextOutlined className="mr-3 text-[#29D8D5] text-lg" />
                            <div>
                                <span className="block text-base font-semibold text-[var(--ohnix-text-primary)]">{t("quotations.quotation_information")}</span>
                                <span className="block text-xs font-normal text-[var(--ohnix-text-muted)]">{t("quotations.quotation_information_hint")}</span>
                            </div>
                        </div>
                    }
                >
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <PointOfSaleField />
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={<span className="font-medium text-[var(--ohnix-text-muted)]">{t("quotations.quotation_number")}</span>}
                                name="quotation_no"
                                extra={t("quotations.quotation_number_hint")}
                                rules={[
                                    { required: true, message: t("quotations.enter_quotation_number") },
                                    { max: 10, message: t("quotations.quotation_number_max_length") },
                                ]}
                            >
                                <Input placeholder={t("quotations.quotation_number_placeholder")} size="large" className="w-full auth-ohnix-input" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={<span className="font-medium text-[var(--ohnix-text-muted)]">{t("purchases.supplier")}</span>}
                                name="supplier_id"
                                extra={t("quotations.supplier_hint")}
                                rules={[{ required: true, message: t("purchases.select_supplier_message") }]}
                            >
                                <Select placeholder={t("purchases.select_supplier")} size="large" className="w-full auth-ohnix-input" showSearch optionFilterProp="children">
                                    {suppliers.map((supplier) => (
                                        <Option key={supplier._id} value={supplier._id}>
                                            {supplier.shopname ? `${supplier.name} (${supplier.shopname})` : supplier.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={<span className="font-medium text-[var(--ohnix-text-muted)]">{t("quotations.valid_until")}</span>}
                                name="valid_until"
                                extra={t("quotations.valid_until_hint")}
                            >
                                <DatePicker
                                    size="large"
                                    className="w-full auth-ohnix-input"
                                    format="YYYY-MM-DD"
                                    placeholder={t("quotations.valid_until")}
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24}>
                            <Form.Item
                                label={<span className="font-medium text-[var(--ohnix-text-muted)]">{t("quotations.notes")}</span>}
                                name="notes"
                                extra={t("quotations.notes_hint")}
                            >
                                <TextArea
                                    placeholder={t("quotations.notes_placeholder")}
                                    rows={3}
                                    autoSize={{ minRows: 2, maxRows: 4 }}
                                    className="auth-ohnix-input quotation-notes-field"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                <Form.List name="details">
                    {(fields, { add, remove }) => (
                        <div>
                            <div className="mb-4 flex items-end justify-between gap-4">
                                <div>
                                    <h4 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">{t("quotations.quotation_details")}</h4>
                                    <p className="mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("quotations.details_hint")}</p>
                                </div>
                                <Button type="primary" onClick={() => add()} icon={<PlusOutlined />} size="middle" className="font-medium">
                                    {t("common.add_item")}
                                </Button>
                            </div>
                            <div className="space-y-4">
                                {fields.map(({ key, name, ...restField }) => (
                                    <PurchaseFormItem
                                        key={key}
                                        products={products}
                                        onRemove={() => remove(name)}
                                        name={name}
                                        restField={restField}
                                        onProductChange={handleProductChange}
                                        className="quotation-detail-row"
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </Form.List>

                <Divider className="my-6" />

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-[var(--ohnix-line-4)]">
                    <Button onClick={onCancel} disabled={submitting} className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200">
                        {t("common.cancel")}
                    </Button>
                    <Button type="primary" htmlType="submit" loading={submitting} className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200">
                        {t("quotations.save_quotation")}
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

QuotationForm.propTypes = {
    visible: PropTypes.bool.isRequired,
    onCancel: PropTypes.func.isRequired,
    onSubmit: PropTypes.func.isRequired,
    suppliers: PropTypes.array.isRequired,
    products: PropTypes.array.isRequired,
    form: PropTypes.object.isRequired,
    initialValues: PropTypes.object,
    submitting: PropTypes.bool,
};

export default QuotationForm;
