import React from "react";
import {
    Modal,
    Form,
    Input,
    Select,
    Row,
    Col,
    Divider,
    Button,
    Space,
    InputNumber,
    Card,
    Tag,
} from "antd";
import {
    PlusOutlined,
    MinusCircleOutlined,
    ShoppingCartOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";

const { Option } = Select;

const PurchaseForm = ({
    visible,
    onCancel,
    onSubmit,
    suppliers,
    products,
    form,
    initialValues,
}) => {
    const { t } = useI18n();
    const { currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    // Build a lookup map for quick access to product details
    const productMap = React.useMemo(() => {
        const map = {};
        products.forEach((p) => {
            map[p._id] = p;
        });
        return map;
    }, [products]);

    const handleProductChange = (productId, fieldName) => {
        const product = productMap[productId];
        if (!product) return;

        // Auto-fill the unit cost with the product's buying price
        const details = form.getFieldValue("details");
        if (!details) return;
        details[fieldName] = {
            ...details[fieldName],
            product_id: productId,
            unitcost: product.buying_price,
        };
        form.setFieldsValue({ details });
    };

    const handleSubmit = (values) => {
        const purchaseData = {
            supplier_id: values.supplier_id,
            purchase_no: values.purchase_no,
            purchase_status: values.purchase_status || "pending",
            details: values.details.map((detail) => ({
                product_id: detail.product_id,
                quantity: detail.quantity,
                unitcost: detail.unitcost,
            })),
        };
        onSubmit(purchaseData);
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white/[0.06] border border-white/10">
                        <ShoppingCartOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-white">{t("purchases.add_new_purchase")}</span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={950}
            className="purchase-form-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background:
                        "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "24px" },
            }}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                initialValues={initialValues}
                className="mt-2"
            >
                <Card className="mb-1 border border-white/10 bg-white/[0.03] text-white shadow-sm">
                    <Row gutter={[16, 16]}>
                        <Col xs={24} sm={12}>
                            <Form.Item label={t("purchases.purchase_number")} name="purchase_no" rules={[{ required: true, message: t("purchases.enter_purchase_number") }, { max: 10, message: t("purchases.purchase_number_max_length") }]}>
                                <Input placeholder={t("purchases.purchase_number_placeholder")} size="large" className="rounded-lg purchase-form-input" />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item label={t("purchases.supplier")} name="supplier_id" rules={[{ required: true, message: t("purchases.select_supplier_message") }]}>
                                <Select placeholder={t("purchases.select_supplier")} size="large" className="rounded-lg purchase-form-input" showSearch optionFilterProp="children">
                                    {suppliers.map((supplier) => (
                                        <Option key={supplier._id} value={supplier._id}>
                                            {supplier.shopname ? `${supplier.name} (${supplier.shopname})` : supplier.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24}>
                            <Form.Item label={t("common.status")} name="purchase_status">
                                <Select placeholder={t("purchases.select_status")} size="large" className="rounded-lg purchase-form-input">
                                    <Option value="pending">{t("purchases.pending")}</Option>
                                    <Option value="completed">{t("purchases.completed")}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                    <Divider orientation="left">
                        <span className="text-lg font-medium text-white">{t("purchases.purchase_details")}</span>
                    </Divider>

                <Form.List name="details">
                    {(fields, { add, remove }) => (
                        <>
                            {fields.map(({ key, name, ...restField }) => {
                                // Watch the selected product for this row to show stock info
                                const selectedProductId = form.getFieldValue([
                                    "details",
                                    name,
                                    "product_id",
                                ]);
                                const selectedProduct =
                                    productMap[selectedProductId];

                                return (
                                    <Card
                                        key={key}
                                        className="mb-4 border border-white/10 shadow-sm bg-white/[0.03] text-white"
                                    >
                                        <Row gutter={[16, 16]} align="middle">
                                            <Col xs={24} sm={8}>
                                                <Form.Item {...restField} name={[name, "product_id"]} label={t("products.product")} rules={[{ required: true, message: t("purchases.select_product_message") }]}>
                                                    <Select
                                                        placeholder={t("purchases.select_product")}
                                                        showSearch
                                                        optionFilterProp="label"
                                                        className="rounded-lg purchase-form-input"
                                                        onChange={(val) =>
                                                            handleProductChange(
                                                                val,
                                                                name
                                                            )
                                                        }
                                                        options={products.map(
                                                            (product) => ({
                                                                value: product._id,
                                                                label: `${product.product_name} (${product.product_code})`,
                                                            })
                                                        )}
                                                    />
                                                </Form.Item>
                                                {/* Show current stock below the select */}
                                                {selectedProduct && (
                                                    <div className="mt-1 mb-2">
                                                        <Tag
                                                            color={
                                                                selectedProduct.stock ===
                                                                0
                                                                    ? "red"
                                                                    : selectedProduct.stock <
                                                                        10
                                                                      ? "orange"
                                                                      : "green"
                                                            }
                                                        >
                                                            Current Stock:{" "}
                                                            {
                                                                selectedProduct.stock
                                                            }
                                                        </Tag>
                                                    </div>
                                                )}
                                            </Col>
                                            <Col xs={24} sm={6}>
                                                <Form.Item {...restField} name={[name, "quantity"]} label={t("common.quantity")} rules={[{ required: true, message: t("purchases.enter_quantity_message") }]}>
                                                    <InputNumber
                                                        placeholder={t("purchases.quantity_placeholder")}
                                                        min={1}
                                                        style={{
                                                            width: "100%",
                                                        }}
                                                        className="rounded-lg purchase-form-input"
                                                    />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={7}>
                                                <Form.Item {...restField} name={[name, "unitcost"]} label={t("purchases.unit_price")} rules={[{ required: true, message: t("purchases.enter_unit_price_message") }]}>
                                                    <InputNumber
                                                        placeholder={t("purchases.unit_price_placeholder")}
                                                        min={0}
                                                        precision={2}
                                                        style={{
                                                            width: "100%",
                                                        }}
                                                        prefix={currency.symbol}
                                                        className="rounded-lg purchase-form-input"
                                                        formatter={currencyInputProps.formatter}
                                                        parser={currencyInputProps.parser}
                                                    />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={3}>
                                                <Form.Item label=" ">
                                                    <Button
                                                        type="default"
                                                        onClick={() =>
                                                            remove(name)
                                                        }
                                                        icon={
                                                            <MinusCircleOutlined />
                                                        }
                                                        danger
                                                        className="w-full"
                                                    />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                    </Card>
                                );
                            })}
                            <Form.Item>
                                <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} size="large" className="h-12 border-2 border-dashed border-blue-300 text-blue-600 hover:border-blue-400 hover:text-blue-700 rounded-lg">
                                    {t("common.add_item")}
                                </Button>
                            </Form.Item>
                        </>
                    )}
                </Form.List>

                <Form.Item className="mb-0 pt-4">
                    <Row justify="end">
                            <Space size="large">
                                <Button onClick={onCancel} size="large" className="px-8 bg-white/[0.04] border-white/10 text-white hover:text-[#44F3F0] hover:border-[#44F3F0]">{t("common.cancel")}</Button>
                                <Button type="primary" htmlType="submit" size="large" className="px-8 bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 shadow-lg hover:shadow-xl transition-all duration-300 text-[#021314]">{t("purchases.create_purchase")}</Button>
                            </Space>
                    </Row>
                </Form.Item>
            </Form>

        </Modal>
    );
};

export default PurchaseForm;
