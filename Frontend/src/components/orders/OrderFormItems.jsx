import React, { useState } from "react";
import { Form, Row, Col, Select, InputNumber, Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";

const { Option } = Select;

const OrderFormItems = ({ products, onRemove, name, restField, locked }) => {
    const form = Form.useFormInstance();
    const { t } = useI18n();
    const { currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);

    const initialProductId = form.getFieldValue(["orderItems", name, "product_id"]);
    const [availableStock, setAvailableStock] = useState(() => {
        const initial = products.find((p) => p._id === initialProductId);
        return initial ? initial.stock : null;
    });

    const handleProductChange = (productId) => {
        const selected = products.find((p) => p._id === productId);
        if (selected) {
            form.setFieldValue(
                ["orderItems", name, "unitcost"],
                selected.selling_price
            );
            setAvailableStock(selected.stock);

            const currentQty = form.getFieldValue(["orderItems", name, "quantity"]);
            if (currentQty > selected.stock) {
                form.setFieldValue(["orderItems", name, "quantity"], selected.stock || 1);
            }
        } else {
            setAvailableStock(null);
        }
    };

    return (
        <div className="relative module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-5 mb-4">
            <Button
                type="text"
                danger
                onClick={onRemove}
                className="absolute top-3 right-3 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-red-500/10 z-10"
                icon={<DeleteOutlined className="text-sm" />}
            />

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
                                {
                                    required: true,
                                    message: t("orders.select_product_message"),
                                },
                            ]}
                            className="mb-0"
                            extra={locked ? t("inventory_tour.practice_locked_hint") : undefined}
                        >
                            <Select
                                placeholder={t("orders.select_product")}
                                showSearch
                                optionFilterProp="label"
                                size="large"
                                className="w-full auth-ohnix-input"
                                onChange={handleProductChange}
                                disabled={locked}
                            >
                                {products.map((product) => (
                                    <Option
                                        key={product._id}
                                        value={product._id}
                                        label={product.product_name}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{product.product_name}</span>
                                            <span className="text-xs text-[var(--ohnix-text-dim)] ml-2">
                                                {t("orders.stock")}: {product.stock}
                                            </span>
                                        </div>
                                    </Option>
                                ))}
                            </Select>
                        </Form.Item>
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
                            extra={
                                availableStock !== null ? (
                                    <span className="text-xs text-[var(--ohnix-text-dim)]">
                                        {t("orders.stock")}: {availableStock}
                                    </span>
                                ) : null
                            }
                            rules={[
                                {
                                    required: true,
                                    message: t("orders.enter_quantity_message"),
                                },
                                {
                                    validator: (_, value) => {
                                        if (
                                            availableStock !== null &&
                                            value !== undefined &&
                                            value !== null &&
                                            value > availableStock
                                        ) {
                                            return Promise.reject(
                                                t("orders.quantity_exceeds_stock", { stock: availableStock })
                                            );
                                        }
                                        return Promise.resolve();
                                    },
                                },
                            ]}
                            className="mb-0"
                        >
                            <InputNumber
                                placeholder="0"
                                min={1}
                                max={availableStock ?? undefined}
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
                                    {t("orders.unit_price")}
                                </span>
                            }
                            rules={[
                                {
                                    required: true,
                                    message: t("orders.enter_unit_price_message"),
                                },
                            ]}
                            className="mb-0"
                            extra={locked ? t("inventory_tour.practice_locked_hint") : undefined}
                        >
                            <InputNumber
                                placeholder={t("orders.selling_price")}
                                min={0}
                                step={0.01}
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

export default OrderFormItems;
