import React, { useEffect } from "react";
import { Modal, Form, InputNumber, Select, Input, Button } from "antd";
import { SwapOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { TextArea } = Input;

const fieldLabel = (text) => (
    <span className="font-medium text-[var(--ohnix-text-muted)]">{text}</span>
);

// Moves stock of one product between two of the account's Points of Sale -
// the counterpart to AdjustStockModal (which changes how much of a product
// exists), this only changes where it is. See
// Backend/services/productLocationStock.service.js#transferStock: one
// atomic operation, Product.stock (the account-wide total) never changes.
const TransferStockModal = ({ visible, product, pointsOfSale, locationStock, loading, onSubmit, onCancel }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const fromId = Form.useWatch("fromPointOfSaleId", form);
    const quantity = Form.useWatch("quantity", form);

    useEffect(() => {
        if (visible) {
            form.resetFields();
        }
    }, [visible, form]);

    if (!product) return null;

    const stockAt = (pointOfSaleId) =>
        locationStock.find((row) => row.point_of_sale_id === pointOfSaleId)?.stock ?? 0;

    const handleOk = async () => {
        const values = await form.validateFields();
        await onSubmit(product._id, {
            from_point_of_sale_id: values.fromPointOfSaleId,
            to_point_of_sale_id: values.toPointOfSaleId,
            quantity: values.quantity,
            reason: values.reason?.trim() || undefined,
        });
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <SwapOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {t("products.transfer_stock_modal_title")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={460}
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
            <div className="mb-5 p-4 rounded-xl bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)]">
                <p className="text-sm font-semibold text-[var(--ohnix-text-primary)] m-0 truncate">
                    {product.product_name}
                </p>
            </div>

            <Form form={form} layout="vertical">
                <Form.Item
                    name="fromPointOfSaleId"
                    label={fieldLabel(t("products.transfer_from_label"))}
                    rules={[{ required: true, message: t("orders.enter_quantity_message") }]}
                >
                    <Select
                        size="large"
                        className="w-full"
                        options={(pointsOfSale || []).map((pos) => ({
                            value: pos.id,
                            label: `${pos.name} (${stockAt(pos.id)})`,
                        }))}
                    />
                </Form.Item>

                <Form.Item
                    name="toPointOfSaleId"
                    label={fieldLabel(t("products.transfer_to_label"))}
                    dependencies={["fromPointOfSaleId"]}
                    rules={[
                        { required: true, message: t("orders.enter_quantity_message") },
                        {
                            validator: (_, value) => {
                                if (value && value === fromId) {
                                    return Promise.reject(t("products.transfer_same_location_error"));
                                }
                                return Promise.resolve();
                            },
                        },
                    ]}
                >
                    <Select
                        size="large"
                        className="w-full"
                        options={(pointsOfSale || [])
                            .filter((pos) => pos.id !== fromId)
                            .map((pos) => ({ value: pos.id, label: `${pos.name} (${stockAt(pos.id)})` }))}
                    />
                </Form.Item>

                <Form.Item
                    name="quantity"
                    label={fieldLabel(t("products.transfer_quantity_label"))}
                    rules={[
                        { required: true, message: t("orders.enter_quantity_message") },
                        {
                            validator: (_, value) => {
                                if (fromId && value > stockAt(fromId)) {
                                    return Promise.reject(
                                        t("orders.quantity_exceeds_stock", { stock: stockAt(fromId) })
                                    );
                                }
                                return Promise.resolve();
                            },
                        },
                    ]}
                >
                    <InputNumber min={1} className="w-full auth-ohnix-input" size="large" />
                </Form.Item>

                <Form.Item name="reason" label={fieldLabel(t("products.transfer_reason_label"))} className="mb-0">
                    <TextArea
                        rows={2}
                        maxLength={280}
                        showCount
                        placeholder={t("products.transfer_reason_placeholder")}
                        className="auth-ohnix-input"
                    />
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
                    disabled={!quantity}
                    className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                >
                    {t("products.apply_transfer")}
                </Button>
            </div>
        </Modal>
    );
};

export default TransferStockModal;
