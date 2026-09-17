import React, { useEffect } from "react";
import { Modal, Form, InputNumber, Radio, Input, Button, DatePicker } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined, SwapOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { TextArea } = Input;

const fieldLabel = (text) => (
    <span className="font-medium text-[var(--ohnix-text-muted)]">{text}</span>
);

const AdjustStockModal = ({ visible, product, loading, onSubmit, onCancel }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const direction = Form.useWatch("direction", form);
    const quantity = Form.useWatch("quantity", form);

    useEffect(() => {
        if (visible) {
            form.setFieldsValue({ direction: "in", quantity: 1, reason: "" });
        }
    }, [visible, form]);

    if (!product) return null;

    const delta = direction === "out" ? -(quantity || 0) : quantity || 0;
    const resultingStock = product.stock + delta;
    const isNegative = resultingStock < 0;

    const handleOk = async () => {
        const values = await form.validateFields();
        const finalDelta = values.direction === "out" ? -values.quantity : values.quantity;
        await onSubmit(product._id, {
            delta: finalDelta,
            reason: values.reason.trim(),
            ...(product.tracks_batches && values.direction === "in"
                ? {
                      batchNumber: values.batch_number.trim(),
                      batchExpirationDate: values.batch_expiration_date ? values.batch_expiration_date.toISOString() : null,
                  }
                : {}),
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
                        {t("products.adjust_stock")}
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
                    background:
                        "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
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
            <div className="mb-5 p-4 rounded-xl bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--ohnix-text-primary)] m-0 truncate">
                        {product.product_name}
                    </p>
                    <p className="text-xs text-[var(--ohnix-text-muted)] m-0 mt-0.5">
                        {t("products.stock")}: {product.stock}
                    </p>
                </div>
                {quantity > 0 && (
                    <div className="text-right flex-shrink-0">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] m-0">
                            {t("products.new_stock_preview")}
                        </p>
                        <p
                            className={`text-lg font-bold m-0 ${
                                isNegative ? "text-red-400" : "text-[#44F3F0]"
                            }`}
                        >
                            {resultingStock}
                        </p>
                    </div>
                )}
            </div>

            <Form form={form} layout="vertical">
                <Form.Item name="direction" label={fieldLabel(t("products.adjustment_direction"))}>
                    <Radio.Group buttonStyle="solid" className="w-full flex stock-direction-toggle">
                        <Radio.Button value="in" className="flex-1 text-center">
                            <ArrowUpOutlined /> {t("products.stock_in")}
                        </Radio.Button>
                        <Radio.Button value="out" className="flex-1 text-center">
                            <ArrowDownOutlined /> {t("products.stock_out")}
                        </Radio.Button>
                    </Radio.Group>
                </Form.Item>

                <Form.Item
                    name="quantity"
                    label={fieldLabel(t("common.quantity"))}
                    rules={[
                        { required: true, message: t("orders.enter_quantity_message") },
                        {
                            validator: (_, value) => {
                                if (direction === "out" && value > product.stock) {
                                    return Promise.reject(
                                        t("orders.quantity_exceeds_stock", { stock: product.stock })
                                    );
                                }
                                return Promise.resolve();
                            },
                        },
                    ]}
                >
                    <InputNumber min={1} className="w-full auth-ohnix-input" size="large" />
                </Form.Item>

                {product.tracks_batches && direction === "in" && (
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

                <Form.Item
                    name="reason"
                    label={fieldLabel(t("products.adjustment_reason"))}
                    rules={[{ required: true, message: t("products.adjustment_reason_required") }]}
                    className="mb-0"
                >
                    <TextArea
                        rows={3}
                        maxLength={280}
                        showCount
                        placeholder={t("products.adjustment_reason_placeholder")}
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
                    className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                >
                    {t("products.apply_adjustment")}
                </Button>
            </div>
        </Modal>
    );
};

export default AdjustStockModal;
