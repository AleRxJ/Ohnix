import React, { useEffect } from "react";
import { Modal, Form, InputNumber, Radio, Input, Typography } from "antd";
import { ArrowUpOutlined, ArrowDownOutlined, SwapOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;
const { TextArea } = Input;

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

    const handleOk = async () => {
        const values = await form.validateFields();
        const finalDelta = values.direction === "out" ? -values.quantity : values.quantity;
        await onSubmit(product._id, { delta: finalDelta, reason: values.reason.trim() });
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
            onOk={handleOk}
            confirmLoading={loading}
            okText={t("products.apply_adjustment")}
            cancelText={t("common.cancel")}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
                    border: "1px solid var(--ohnix-line-4)",
                    borderRadius: "20px",
                },
            }}
        >
            <div className="mb-4 p-3 rounded-xl bg-white/[0.03] border border-[var(--ohnix-line-4)] flex items-center justify-between">
                <div>
                    <Text className="block text-sm font-semibold text-[var(--ohnix-text-primary)]">
                        {product.product_name}
                    </Text>
                    <Text className="text-xs text-[var(--ohnix-text-muted)]">
                        {t("products.stock")}: {product.stock}
                    </Text>
                </div>
                {quantity > 0 && (
                    <div className="text-right">
                        <Text className="text-xs text-[var(--ohnix-text-dim)] block">
                            {t("products.new_stock_preview")}
                        </Text>
                        <Text
                            className={`text-base font-bold ${
                                resultingStock < 0 ? "text-red-400" : "text-[#44F3F0]"
                            }`}
                        >
                            {resultingStock}
                        </Text>
                    </div>
                )}
            </div>

            <Form form={form} layout="vertical">
                <Form.Item name="direction" label={t("products.adjustment_direction")}>
                    <Radio.Group buttonStyle="solid" className="w-full flex">
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
                    label={t("common.quantity")}
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

                <Form.Item
                    name="reason"
                    label={t("products.adjustment_reason")}
                    rules={[{ required: true, message: t("products.adjustment_reason_required") }]}
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
        </Modal>
    );
};

export default AdjustStockModal;
