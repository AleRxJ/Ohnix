import React, { useContext, useEffect } from "react";
import { Modal, Form, Input, Select, InputNumber, Row, Col } from "antd";
import ProductImageUpload from "./ProductImageUpload";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";
import AuthContext from "../../context/AuthContext";
import useSubscription from "../../hooks/useSubscription";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";

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
    const { currency } = useCurrency();
    const { user } = useContext(AuthContext);
    const { can } = useSubscription();
    const { team } = useTeam();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    const usesColombianEInvoicing =
        user?.company?.countryCode === "CO" && user?.company?.electronicInvoicingEnabled;

    // Live presence + soft-lock (team plans only, and only once there's a
    // real record to collide on - a brand-new product being created hasn't
    // got an id yet). See hooks/useResourcePresence.js.
    const { viewers, lock, acquireLock, releaseLock } = useResourcePresence({
        resourceType: "product",
        resourceId: editingProduct?._id,
        active: visible && Boolean(team) && Boolean(editingProduct?._id),
    });

    useEffect(() => {
        if (visible && editingProduct?._id && team) {
            acquireLock();
        }
        if (!visible) {
            releaseLock();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, editingProduct?._id]);

    return (
        <Modal
            title={
                <div className="text-xl text-center font-bold text-[var(--ohnix-text-primary)]">
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
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
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
                {team && editingProduct?._id && (
                    <PresenceLockBar viewers={viewers} lock={lock} currentUserId={user?.id} />
                )}
                <Row gutter={20} className="space-y-4 lg:space-y-0">
                    <Col xs={24} lg={14}>
                        <div className="space-y-4">
                            <div className="module-shell p-4 reveal-card">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--ohnix-line-3)]">
                                    <div className="w-1 h-4 bg-[#29D8D5] rounded-full"></div>
                                    <h3 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">
                                        {t("products.product_details")}
                                    </h3>
                                </div>
                                <Row gutter={12}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="product_name"
                                            label={
                                                <span className="text-xs font-medium text-[var(--ohnix-text-muted)]">
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
                                                <span className="text-xs font-medium text-[var(--ohnix-text-muted)]">
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
                                                <span className="text-xs font-medium text-[var(--ohnix-text-muted)]">
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
                                                <span className="text-xs font-medium text-[var(--ohnix-text-muted)]">
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
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--ohnix-line-3)]">
                                    <div className="w-1 h-4 bg-[#44F3F0] rounded-full"></div>
                                    <h3 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">
                                        {t("products.pricing")}
                                    </h3>
                                </div>
                                <Row gutter={12}>
                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="buying_price"
                                            label={
                                                <span className="text-xs font-medium text-[var(--ohnix-text-muted)]">
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
                                                prefix={currency.symbol}
                                                style={{ width: "100%" }}
                                                precision={2}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                                formatter={currencyInputProps.formatter}
                                                parser={currencyInputProps.parser}
                                            />
                                        </Form.Item>
                                    </Col>

                                    <Col xs={24} sm={12}>
                                        <Form.Item
                                            name="selling_price"
                                            label={
                                                <span className="text-xs font-medium text-[var(--ohnix-text-muted)]">
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
                                                prefix={currency.symbol}
                                                style={{ width: "100%" }}
                                                precision={2}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                                formatter={currencyInputProps.formatter}
                                                parser={currencyInputProps.parser}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>

                            <div className="module-shell p-4 reveal-card border border-[var(--ohnix-line-4)]">
                                <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--ohnix-line-3)]">
                                    <div className="w-1 h-4 bg-[#29D8D5] rounded-full"></div>
                                    <h3 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">
                                        {t("products.low_stock_alert")}
                                    </h3>
                                </div>
                                <Form.Item
                                    name="low_stock_threshold"
                                    label={
                                        <span className="text-xs font-medium text-[var(--ohnix-text-muted)]">
                                            {t("products.low_stock_threshold")}
                                        </span>
                                    }
                                    extra={
                                        <span className="text-[var(--ohnix-text-dim)]">
                                            {can("configurableAlerts")
                                                ? t("products.low_stock_threshold_hint")
                                                : t("products.low_stock_threshold_upsell")}
                                        </span>
                                    }
                                    className="mb-0"
                                >
                                    <InputNumber
                                        min={0}
                                        precision={0}
                                        size="large"
                                        className="w-full auth-ohnix-input"
                                        placeholder={t("products.low_stock_threshold_placeholder")}
                                        disabled={!can("configurableAlerts")}
                                    />
                                </Form.Item>
                            </div>

                            {usesColombianEInvoicing && (
                                <div className="module-shell p-4 reveal-card border border-[#29D8D5]/15">
                                    <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-[var(--ohnix-line-3)]">
                                        <div className="flex items-center gap-2">
                                            <div className="w-1 h-4 bg-[#44F3F0] rounded-full"></div>
                                            <h3 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">{t("products.dian_classification")}</h3>
                                        </div>
                                        <span className="text-[11px] text-[#44F3F0]">Factus V2</span>
                                    </div>
                                    <Row gutter={12}>
                                        <Col xs={24} sm={12}>
                                            <Form.Item name="unit_measure_code" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.dian_unit")}</span>} initialValue="94" rules={[{ required: true, message: t("products.dian_unit_required") }]}>
                                                <Input size="large" className="auth-ohnix-input" placeholder="94" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} sm={12}>
                                            <Form.Item name="standard_code" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.dian_standard_code")}</span>} initialValue="999" rules={[{ required: true, message: t("products.dian_standard_code_required") }]}>
                                                <Input size="large" className="auth-ohnix-input" placeholder="999" />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} sm={12}>
                                            <Form.Item name="tax_code" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.dian_tax")}</span>} initialValue="01">
                                                <Select size="large" className="auth-ohnix-input" options={[{ value: "01", label: t("customers.dian_tax_vat") }, { value: "04", label: "INC" }]} />
                                            </Form.Item>
                                        </Col>
                                        <Col xs={24} sm={12}>
                                            {/* Defaults to Colombia's general VAT rate since this block only
                                                renders for CO companies with electronic invoicing enabled. */}
                                            <Form.Item name="tax_rate" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.dian_tax_rate")}</span>} initialValue={19}>
                                                <InputNumber min={0} max={100} precision={2} size="large" className="w-full auth-ohnix-input" />
                                            </Form.Item>
                                        </Col>
                                    </Row>
                                </div>
                            )}
                        </div>
                    </Col>

                    <Col xs={24} lg={10}>
                        <div className="module-shell p-4 h-full reveal-card">
                            <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[var(--ohnix-line-3)]">
                                <div className="w-1 h-4 bg-[#29D8D5] rounded-full"></div>
                                <h3 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">
                                    {t("products.product_image")}
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
