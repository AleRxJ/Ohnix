import React from "react";
import { Form, Row, Col, Select, InputNumber, Button, Tag } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";

const { Option } = Select;

const PurchaseFormItem = ({ products, onRemove, name, restField, locked, hideRemove, onProductChange }) => {
    const form = Form.useFormInstance();
    const { t } = useI18n();
    const { currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);

    const selectedProductId = form.getFieldValue(["details", name, "product_id"]);
    const selectedProduct = products.find((p) => p._id === selectedProductId);

    const revalidateProductFields = () => {
        const details = form.getFieldValue("details") || [];
        const paths = details.map((_, idx) => ["details", idx, "product_id"]);
        form.validateFields(paths).catch(() => {});
    };

    return (
        <div className="relative module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-5 mb-4">
            {!hideRemove && (
                <Button
                    type="text"
                    danger
                    onClick={() => {
                        onRemove();
                        revalidateProductFields();
                    }}
                    className="absolute top-3 right-3 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-red-500/10 z-10"
                    icon={<DeleteOutlined className="text-sm" />}
                />
            )}

            <div className="pr-10">
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={24} md={24} lg={12}>
                        <Form.Item
                            {...restField}
                            name={[name, "product_id"]}
                            label={
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
                                    {t("products.product")}
                                </span>
                            }
                            rules={[
                                { required: true, message: t("purchases.select_product_message") },
                                {
                                    validator: (_, value) => {
                                        if (!value) return Promise.resolve();
                                        const details = form.getFieldValue("details") || [];
                                        const occurrences = details.filter(
                                            (d) => d?.product_id === value
                                        ).length;
                                        if (occurrences > 1) {
                                            return Promise.reject(
                                                new Error(t("purchases.duplicate_product_message"))
                                            );
                                        }
                                        return Promise.resolve();
                                    },
                                },
                            ]}
                            className="mb-0"
                            extra={locked ? t("inventory_tour.practice_locked_hint") : undefined}
                        >
                            <Select
                                placeholder={t("purchases.select_product")}
                                showSearch
                                optionFilterProp="label"
                                size="large"
                                className="w-full auth-ohnix-input"
                                onChange={(val) => {
                                    onProductChange(val, name);
                                    revalidateProductFields();
                                }}
                                disabled={locked}
                            >
                                {products.map((product) => (
                                    <Option
                                        key={product._id}
                                        value={product._id}
                                        label={`${product.product_name} (${product.product_code})`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{product.product_name}</span>
                                            <span className="text-xs text-[var(--ohnix-text-dim)] ml-2">
                                                {t("purchases.current_stock_label")}: {product.stock}
                                            </span>
                                        </div>
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
                        {selectedProduct && (
                            <Tag
                                className="mt-2"
                                color={
                                    selectedProduct.stock === 0
                                        ? "red"
                                        : selectedProduct.stock < 10
                                          ? "orange"
                                          : "green"
                                }
                            >
                                {t("purchases.current_stock_label")}: {selectedProduct.stock}
                            </Tag>
                        )}
                    </Col>

                    <Col xs={12} sm={12} md={12} lg={6}>
                        <Form.Item
                            {...restField}
                            name={[name, "quantity"]}
                            label={
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
                                    {t("common.quantity")}
                                </span>
                            }
                            rules={[{ required: true, message: t("purchases.enter_quantity_message") }]}
                            className="mb-0"
                            extra={locked ? t("inventory_tour.practice_locked_hint") : undefined}
                        >
                            <InputNumber
                                placeholder={t("purchases.quantity_placeholder")}
                                min={1}
                                className="w-full auth-ohnix-input"
                                size="large"
                                disabled={locked}
                            />
                        </Form.Item>
                    </Col>

                    <Col xs={12} sm={12} md={12} lg={6}>
                        <Form.Item
                            {...restField}
                            name={[name, "unitcost"]}
                            label={
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
                                    {t("purchases.unit_price")}
                                </span>
                            }
                            rules={[{ required: true, message: t("purchases.enter_unit_price_message") }]}
                            className="mb-0"
                            extra={locked ? t("inventory_tour.practice_locked_hint") : undefined}
                        >
                            <InputNumber
                                placeholder={t("purchases.unit_price_placeholder")}
                                min={0}
                                precision={2}
                                className="w-full auth-ohnix-input"
                                size="large"
                                prefix={currency.symbol}
                                formatter={currencyInputProps.formatter}
                                parser={currencyInputProps.parser}
                                disabled={locked}
                            />
                        </Form.Item>
                    </Col>
                </Row>
            </div>
        </div>
    );
};

export default PurchaseFormItem;
