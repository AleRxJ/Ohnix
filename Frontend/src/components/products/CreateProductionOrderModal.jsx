import React, { useEffect } from "react";
import { Modal, Form, Select, InputNumber, Input, DatePicker, Button } from "antd";
import { BuildOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";
import PointOfSaleField from "../common/PointOfSaleField";

const { Option } = Select;
const { TextArea } = Input;

const fieldLabel = (text) => (
    <span className="font-medium text-[var(--ohnix-text-muted)]">{text}</span>
);

// Drafts a new ProductionOrder - only manufactured products are selectable
// (see product.controller.js's isManufactured/recipeComponents), quantity
// scales the recipe preview below live, and the batch fields only appear
// for a product that also tracks lots (see Backend/services/
// productionOrder.service.js#createProductionOrder).
const CreateProductionOrderModal = ({ visible, manufacturedProducts, loading, onSubmit, onCancel }) => {
    const { t } = useI18n();
    const { currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    const [form] = Form.useForm();
    const productId = Form.useWatch("product_id", form);
    const quantity = Form.useWatch("quantity", form);
    const selectedProduct = (manufacturedProducts || []).find((p) => p._id === productId);

    useEffect(() => {
        if (visible) {
            form.resetFields();
            form.setFieldsValue({ quantity: 1 });
        }
    }, [visible, form]);

    const handleOk = async () => {
        const values = await form.validateFields();
        await onSubmit({
            productId: values.product_id,
            quantity: values.quantity,
            laborCost: values.labor_cost || 0,
            overheadCost: values.overhead_cost || 0,
            ...(selectedProduct?.tracks_batches && {
                batchNumber: values.batch_number,
                batchExpirationDate: values.batch_expiration_date ? values.batch_expiration_date.toISOString() : null,
            }),
            notes: values.notes?.trim() || undefined,
            pointOfSaleId: values.pointOfSaleId,
        });
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <BuildOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {t("products.new_production_order")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={520}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "20px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            <Form form={form} layout="vertical">
                <Form.Item
                    name="product_id"
                    label={fieldLabel(t("products.manufactured_product"))}
                    rules={[{ required: true, message: t("products.recipe_component_required") }]}
                >
                    <Select
                        showSearch
                        size="large"
                        placeholder={t("products.select_manufactured_product")}
                        optionFilterProp="children"
                        className="w-full auth-ohnix-input"
                        notFoundContent={t("products.no_manufactured_products")}
                    >
                        {(manufacturedProducts || []).map((p) => (
                            <Option key={p._id} value={p._id}>
                                {p.product_name} ({p.product_code})
                            </Option>
                        ))}
                    </Select>
                </Form.Item>

                {selectedProduct && (
                    <div className="mb-4 p-3 rounded-xl bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)]">
                        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] mb-2">
                            {t("products.recipe_preview")}
                        </p>
                        <div className="space-y-1">
                            {(selectedProduct.recipe_components || []).map((c) => (
                                <div key={c.product_id} className="flex items-center justify-between text-sm">
                                    <span className="text-[var(--ohnix-text-primary)] truncate">{c.product_name}</span>
                                    <span className="text-[var(--ohnix-text-muted)] flex-shrink-0 ml-2">
                                        {Number(c.quantity) * (Number(quantity) || 0)} ({t("products.stock")}: {c.stock})
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Form.Item
                    name="quantity"
                    label={fieldLabel(t("products.quantity_to_produce"))}
                    rules={[{ required: true, message: t("orders.enter_quantity_message") }]}
                >
                    <InputNumber min={1} precision={0} className="w-full auth-ohnix-input" size="large" />
                </Form.Item>

                <PointOfSaleField />

                {selectedProduct?.tracks_batches && (
                    <>
                        <Form.Item
                            name="batch_number"
                            label={fieldLabel(t("products.batch_number"))}
                            rules={[{ required: true, message: t("products.batch_number_required") }]}
                        >
                            <Input placeholder={t("products.batch_number_placeholder")} className="auth-ohnix-input" size="large" />
                        </Form.Item>
                        <Form.Item name="batch_expiration_date" label={fieldLabel(t("products.batch_expiration_date"))}>
                            <DatePicker className="w-full auth-ohnix-input" size="large" format="YYYY-MM-DD" />
                        </Form.Item>
                    </>
                )}

                <Form.Item name="labor_cost" label={fieldLabel(t("products.labor_cost"))} initialValue={0}>
                    <InputNumber
                        min={0}
                        precision={2}
                        prefix={currency.symbol}
                        formatter={currencyInputProps.formatter}
                        parser={currencyInputProps.parser}
                        className="w-full auth-ohnix-input"
                        size="large"
                    />
                </Form.Item>

                <Form.Item name="overhead_cost" label={fieldLabel(t("products.overhead_cost"))} initialValue={0}>
                    <InputNumber
                        min={0}
                        precision={2}
                        prefix={currency.symbol}
                        formatter={currencyInputProps.formatter}
                        parser={currencyInputProps.parser}
                        className="w-full auth-ohnix-input"
                        size="large"
                    />
                </Form.Item>

                <Form.Item name="notes" label={fieldLabel(t("products.production_notes_label"))} className="mb-0">
                    <TextArea rows={2} maxLength={280} showCount placeholder={t("products.production_notes_placeholder")} className="auth-ohnix-input" />
                </Form.Item>
            </Form>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 mt-5 border-t border-[var(--ohnix-line-4)]">
                <Button
                    onClick={onCancel}
                    disabled={loading}
                    className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                >
                    {t("common.cancel")}
                </Button>
                <Button
                    type="primary"
                    onClick={handleOk}
                    loading={loading}
                    className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                >
                    {t("products.create_production_order")}
                </Button>
            </div>
        </Modal>
    );
};

export default CreateProductionOrderModal;
