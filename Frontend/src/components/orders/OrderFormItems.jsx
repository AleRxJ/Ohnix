import React, { useState } from "react";
import { Form, Row, Col, Select, InputNumber, Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { getCurrencyInputProps, getCurrencyConfig } from "../../utils/currency";

const { Option } = Select;

// currencyCode is the ORDER's own transaction currency (see
// CreateOrderModal.jsx's currency_code field) - unrelated to
// CurrencyContext/useCurrency's global per-browser display preference.
// Defaults to "COP" so any other caller that doesn't pass it keeps today's
// behavior exactly.
const OrderFormItems = ({ products, onRemove, name, restField, locked, currencyCode = "COP" }) => {
    const form = Form.useFormInstance();
    const { t } = useI18n();
    const currency = getCurrencyConfig(currencyCode);
    const currencyInputProps = getCurrencyInputProps(currency.code);
    // Sale-price floor for roles without salesPriceOverride - mirrors
    // Backend utils/salePriceControl.js (which is what actually enforces it,
    // including foreign-currency orders after conversion). Checked here only
    // for COP, where the product's list price is directly comparable.
    const { hasCapability, getCapability } = useTeam();
    const canOverridePrice = hasCapability("salesPriceOverride");
    const maxDiscountPct = getCapability("salesMaxDiscountPct") || 0;
    const minAllowedPrice = () => {
        if (canOverridePrice || currencyCode !== "COP") return null;
        const productId = form.getFieldValue(["orderItems", name, "product_id"]);
        const listPrice = Number(products.find((p) => p._id === productId)?.selling_price);
        return listPrice > 0 ? listPrice * (1 - maxDiscountPct / 100) : null;
    };

    const initialProductId = form.getFieldValue(["orderItems", name, "product_id"]);
    const [availableStock, setAvailableStock] = useState(() => {
        const initial = products.find((p) => p._id === initialProductId);
        return initial ? initial.stock : null;
    });

    const revalidateProductFields = () => {
        const items = form.getFieldValue("orderItems") || [];
        const paths = items.map((_, idx) => ["orderItems", idx, "product_id"]);
        form.validateFields(paths).catch(() => {});
    };

    const handleProductChange = (productId) => {
        const selected = products.find((p) => p._id === productId);
        if (selected) {
            // selling_price is always COP - only useful as a starting point
            // when the order itself is COP. A foreign-currency order needs
            // the actual USD/EUR price typed in by hand (nothing in the
            // system tracks a per-product foreign price), so this leaves the
            // field for the cashier to fill instead of pre-filling a COP
            // number into what's meant to be a USD/EUR input.
            if (currencyCode === "COP") {
                form.setFieldValue(["orderItems", name, "unitcost"], selected.selling_price);
            }
            setAvailableStock(selected.stock);

            const currentQty = form.getFieldValue(["orderItems", name, "quantity"]);
            if (currentQty > selected.stock) {
                form.setFieldValue(["orderItems", name, "quantity"], selected.stock || 1);
            }
        } else {
            setAvailableStock(null);
        }
        revalidateProductFields();
    };

    return (
        <div className="relative module-shell border border-[var(--ohnix-line-4)] rounded-2xl p-5 mb-4">
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
                                {
                                    validator: (_, value) => {
                                        if (!value) return Promise.resolve();
                                        const items = form.getFieldValue("orderItems") || [];
                                        const occurrences = items.filter(
                                            (item) => item?.product_id === value
                                        ).length;
                                        if (occurrences > 1) {
                                            return Promise.reject(
                                                new Error(t("orders.duplicate_product_message"))
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
                                {
                                    validator: (_, value) => {
                                        const floor = minAllowedPrice();
                                        if (floor === null || value === undefined || value === null || Number(value) + 0.01 >= floor) {
                                            return Promise.resolve();
                                        }
                                        return Promise.reject(new Error(
                                            maxDiscountPct > 0
                                                ? t("orders.price_below_allowed_discount", { pct: maxDiscountPct })
                                                : t("orders.price_below_list_not_allowed")
                                        ));
                                    },
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
