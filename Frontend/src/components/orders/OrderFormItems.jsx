import React from "react";
import { Form, Row, Col, Select, InputNumber, Button } from "antd";
import { DeleteOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;

const OrderFormItems = ({ products, onRemove, name, restField }) => {
    const form = Form.useFormInstance();
    const { t } = useI18n();

    const handleProductChange = (productId) => {
        const selected = products.find((p) => p._id === productId);
        if (selected) {
            form.setFieldValue(
                ["orderItems", name, "unitcost"],
                selected.selling_price
            );
        }
    };

    return (
        <div className="relative bg-white border-2 border-gray-200 rounded-2xl p-5 mb-4">
            <Button
                type="text"
                danger
                onClick={onRemove}
                className="absolute top-3 right-3 flex items-center justify-center h-8 w-8 rounded-lg hover:bg-red-50 z-10"
                icon={<DeleteOutlined className="text-sm" />}
            />

            <div className="pr-10">
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={24} md={24} lg={12}>
                        <Form.Item
                            {...restField}
                            name={[name, "product_id"]}
                            label={
                                <span className="text-sm font-medium text-gray-700">
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
                        >
                            <Select
                                placeholder={t("orders.select_product")}
                                showSearch
                                optionFilterProp="label"
                                size="large"
                                className="w-full"
                                onChange={handleProductChange}
                            >
                                {products.map((product) => (
                                    <Option
                                        key={product._id}
                                        value={product._id}
                                        label={product.product_name}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span>{product.product_name}</span>
                                                <span className="text-xs text-gray-400 ml-2">
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
                                <span className="text-sm font-medium text-gray-700">
                                    {t("common.quantity")}
                                </span>
                            }
                            rules={[
                                {
                                    required: true,
                                    message: t("orders.enter_quantity_message"),
                                },
                            ]}
                            className="mb-0"
                        >
                            <InputNumber
                                placeholder="0"
                                min={1}
                                className="w-full"
                                size="large"
                            />
                        </Form.Item>
                    </Col>

                    <Col xs={12} sm={12} md={12} lg={6}>
                        <Form.Item
                            {...restField}
                            name={[name, "unitcost"]}
                            label={
                                <span className="text-sm font-medium text-gray-700">
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
                        >
                            <InputNumber
                                placeholder={t("orders.selling_price")}
                                min={0}
                                step={0.01}
                                className="w-full"
                                size="large"
                                prefix="₹"
                            />
                        </Form.Item>
                    </Col>
                </Row>
            </div>
        </div>
    );
};

export default OrderFormItems;
