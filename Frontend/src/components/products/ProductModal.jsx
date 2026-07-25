import React from "react";
import { Modal, Form, Input, Select, InputNumber, Row, Col } from "antd";
import ProductImageUpload from "./ProductImageUpload";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;

const ProductModal = ({
    visible,
    title,
    form,
    loading,
    categories,
    units,
    editingProduct,
    imageUrl,
    onSave,
    onCancel,
    onImageChange,
}) => {
    const { t } = useI18n();

    return (
        <Modal
            title={
                <div className="text-xl text-center font-bold text-white">
                    {title}
                </div>
            }
            open={visible}
            onCancel={onCancel}
            confirmLoading={loading}
            onOk={onSave}
            width="90%"
            style={{
                maxWidth: "920px",
                top: 32,
            }}
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
                body: {
                    padding: "20px 24px 24px",
                },
            }}
            okText={t("products.save_product")}
            cancelText={t("common.cancel")}
            okButtonProps={{
                size: "large",
                className: "min-w-[140px] h-10",
            }}
            cancelButtonProps={{
                size: "large",
                className: "h-10",
            }}
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{ stock: 0 }}
                className="product-modal-form"
            >
                <Row gutter={20} className="space-y-4 lg:space-y-0">
                    <Col xs={24} lg={14}>
                        <div className="space-y-4">
                            <div className="module-shell p-4 reveal-card">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/8">
                                    <div className="w-1 h-4 bg-[#29D8D5] rounded-full"></div>
                                    <h3 className="text-sm font-semibold text-[#D4DBDF] uppercase tracking-wide">
                                        {t("products.product_details")}
                                    </h3>
                                </div>
                                <Row gutter={12}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="product_name"
                                            label={
                                                <span className="text-xs font-medium text-[#A9B3B8]">
                                                    {t("products.product_name")}
                                                </span>
                                            }
                                            rules={[
                                                {
                                                    required: true,
                                                    message: t("products.enter_product_name_required"),
                                                },
                                                {
                                                    max: 50,
                                                    message: t("products.max_50_chars"),
                                                },
                                            ]}
                                            className="mb-3"
                                        >
                                            <Input
                                                placeholder={t("products.enter_product_name")}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                            />
                                        </Form.Item>
                                    </Col>

                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="product_code"
                                            label={
                                                <span className="text-xs font-medium text-[#A9B3B8]">
                                                    {t("products.product_code")}
                                                </span>
                                            }
                                            rules={[
                                                {
                                                    required: true,
                                                    message: t("products.enter_product_code_required"),
                                                },
                                                {
                                                    max: 5,
                                                    message: t("products.max_5_chars"),
                                                },
                                            ]}
                                            className="mb-3"
                                        >
                                            <Input
                                                placeholder={t("products.enter_product_code")}
                                                disabled={!!editingProduct}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                            />
                                        </Form.Item>
                                    </Col>

                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="category_id"
                                            label={
                                                <span className="text-xs font-medium text-[#A9B3B8]">
                                                    {t("products.category")}
                                                </span>
                                            }
                                            rules={[
                                                {
                                                    required: true,
                                                    message: t("products.select_category_required"),
                                                },
                                            ]}
                                            className="mb-0"
                                        >
                                            <Select
                                                placeholder={t("products.select_category")}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                            >
                                                {categories.map((category) => (
                                                    <Option
                                                        key={category._id}
                                                        value={category._id}
                                                    >
                                                        {category.category_name}
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>

                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="unit_id"
                                            label={
                                                <span className="text-xs font-medium text-[#A9B3B8]">
                                                    {t("products.unit")}
                                                </span>
                                            }
                                            rules={[
                                                {
                                                    required: true,
                                                    message: t("products.select_unit_required"),
                                                },
                                            ]}
                                            className="mb-0"
                                        >
                                            <Select
                                                placeholder={t("products.select_unit")}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                            >
                                                {units.map((unit) => (
                                                    <Option
                                                        key={unit._id}
                                                        value={unit._id}
                                                    >
                                                        {unit.unit_name}
                                                    </Option>
                                                ))}
                                            </Select>
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>

                            <div className="module-shell p-4 reveal-card">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/8">
                                    <div className="w-1 h-4 bg-[#44F3F0] rounded-full"></div>
                                    <h3 className="text-sm font-semibold text-[#D4DBDF] uppercase tracking-wide">
                                        {t("products.pricing")}
                                    </h3>
                                </div>
                                <Row gutter={12}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="buying_price"
                                            label={
                                                <span className="text-xs font-medium text-[#A9B3B8]">
                                                    {t("products.buying_price")}
                                                </span>
                                            }
                                            rules={[
                                                {
                                                    required: true,
                                                    message: t("products.enter_buying_price"),
                                                },
                                                {
                                                    type: "number",
                                                    min: 0,
                                                    message: t("products.price_must_be_positive"),
                                                },
                                            ]}
                                            className="mb-0"
                                        >
                                            <InputNumber
                                                placeholder="0.00"
                                                prefix="₹"
                                                style={{ width: "100%" }}
                                                precision={2}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                            />
                                        </Form.Item>
                                    </Col>

                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="selling_price"
                                            label={
                                                <span className="text-xs font-medium text-[#A9B3B8]">
                                                    {t("products.selling_price")}
                                                </span>
                                            }
                                            rules={[
                                                {
                                                    required: true,
                                                    message: t("products.enter_selling_price"),
                                                },
                                                {
                                                    type: "number",
                                                    min: 0,
                                                    message: t("products.price_must_be_positive"),
                                                },
                                            ]}
                                            className="mb-0"
                                        >
                                            <InputNumber
                                                placeholder="0.00"
                                                prefix="₹"
                                                style={{ width: "100%" }}
                                                precision={2}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>
                        </div>
                    </Col>

                    <Col xs={24} lg={10}>
                        <div className="module-shell p-4 h-full reveal-card">
                            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-white/8">
                                <div className="w-1 h-4 bg-[#29D8D5] rounded-full"></div>
                                <h3 className="text-sm font-semibold text-[#D4DBDF] uppercase tracking-wide">
                                    Product Image
                                </h3>
                            </div>
                            <ProductImageUpload
                                imageUrl={imageUrl}
                                onChange={onImageChange}
                            />
                        </div>
                    </Col>
                </Row>
            </Form>
        </Modal>
    );
};

export default ProductModal;
