import React, { useContext, useEffect, useState } from "react";
import { Modal, Form, Input, Select, InputNumber, Row, Col, Button, Tooltip, Switch, Collapse } from "antd";
import { AppstoreOutlined, ScanOutlined, LockOutlined, InboxOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import ProductImageUpload from "./ProductImageUpload";
import BarcodeScannerModal from "./BarcodeScannerModal";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";
import AuthContext from "../../context/AuthContext";
import useSubscription from "../../hooks/useSubscription";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";
import FieldPresenceHighlighter from "../team/FieldPresenceHighlighter";
import { ELECTRONIC_INVOICING_ENABLED } from "../../config/features";

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
    isTourCreateStep,
}) => {
    const { t } = useI18n();
    const { currency } = useCurrency();
    const { user } = useContext(AuthContext);
    const { can } = useSubscription();
    const { team } = useTeam();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    const usesColombianEInvoicing =
        ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && user?.company?.electronicInvoicingEnabled;
    const taxTreatment = Form.useWatch("tax_treatment", form) || "taxed";
    const isPhysical = Form.useWatch("is_physical", form);
    const weightUnit = Form.useWatch("weight_unit", form) || "g";
    const dimensionUnit = Form.useWatch("dimension_unit", form) || "cm";
    const heightValue = Form.useWatch("height_value", form);
    const widthValue = Form.useWatch("width_value", form);
    const lengthValue = Form.useWatch("length_value", form);
    // Purely a live preview while filling the form - the backend always
    // recomputes and persists the authoritative value itself
    // (product.controller.js#computeVolumetricWeightGrams), so this never
    // needs to be sent as a field.
    const volumetricWeightPreview = (() => {
        const h = Number(heightValue);
        const w = Number(widthValue);
        const l = Number(lengthValue);
        if (!h || !w || !l) return null;
        const toCm = (v) => (dimensionUnit === "m" ? v * 100 : v);
        const grams = (toCm(h) * toCm(w) * toCm(l)) / 5;
        return weightUnit === "kg" ? grams / 1000 : grams;
    })();
    const [scannerOpen, setScannerOpen] = useState(false);
    const codeFieldDisabled = !!editingProduct || isTourCreateStep;

    const handleBarcodeDetected = (decodedText) => {
        const code = String(decodedText).trim().toUpperCase().slice(0, 40);
        form.setFieldsValue({ product_code: code });
        setScannerOpen(false);
        toast.success(t("products.barcode_scanner_detected", { code }));
    };

    // Live presence + soft-lock (team plans only, and only once there's a
    // real record to collide on - a brand-new product being created hasn't
    // got an id yet). See hooks/useResourcePresence.js.
    const { viewers, lock, acquireLock, releaseLock, fieldPresenceHandlers } = useResourcePresence({
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
                <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <AppstoreOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-xl font-bold text-[var(--ohnix-text-primary)]">
                        {title}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width="90%"
            style={{
                maxWidth: "920px",
                top: 32,
            }}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background:
                        "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
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
        >
            <Form
                form={form}
                layout="vertical"
                initialValues={{
                    stock: 0,
                    is_physical: true,
                    weight_unit: "g",
                    dimension_unit: "cm",
                    units_per_package: 1,
                    packaging_type: "box",
                }}
                className="product-modal-form"
                {...fieldPresenceHandlers}
            >
                {team && editingProduct?._id && (
                    <>
                        <PresenceLockBar viewers={viewers} lock={lock} currentUserId={user?.id} />
                        <FieldPresenceHighlighter viewers={viewers} currentUserId={user?.id} />
                    </>
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
                                            extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                                        >
                                            <Input
                                                placeholder={t("products.enter_product_name")}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                                disabled={isTourCreateStep}
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
                                                    max: 40,
                                                    message: t("products.max_40_chars"),
                                                },
                                            ]}
                                            className="mb-3"
                                            extra={
                                                codeFieldDisabled ? undefined : (
                                                    <span className="text-[var(--ohnix-text-dim)]">
                                                        {t("products.product_code_scanner_hint")}
                                                    </span>
                                                )
                                            }
                                        >
                                            <Input
                                                placeholder={t("products.enter_product_code")}
                                                disabled={codeFieldDisabled}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                                suffix={
                                                    codeFieldDisabled ? null : (
                                                        <Button
                                                            type="text"
                                                            size="small"
                                                            icon={<ScanOutlined className="text-[#29D8D5]" />}
                                                            onClick={() => setScannerOpen(true)}
                                                            className="flex items-center justify-center -mr-2"
                                                        />
                                                    )
                                                }
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
                                            extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                                        >
                                            <Select
                                                placeholder={t("products.select_category")}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                                disabled={isTourCreateStep}
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
                                            extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                                        >
                                            <Select
                                                placeholder={t("products.select_unit")}
                                                size="large"
                                                className="rounded-md auth-ohnix-input"
                                                disabled={isTourCreateStep}
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
                                                disabled={isTourCreateStep}
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
                                                disabled={isTourCreateStep}
                                            />
                                        </Form.Item>
                                    </Col>
                                </Row>
                            </div>

                            <div className="module-shell p-4 reveal-card">
                                <div className="flex items-center justify-between gap-3 mb-3 pb-2 border-b border-[var(--ohnix-line-3)]">
                                    <div className="flex items-center gap-2">
                                        <div className="w-1 h-4 bg-[#44F3F0] rounded-full"></div>
                                        <h3 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">
                                            {t("products.physical_characteristics")}
                                        </h3>
                                    </div>
                                    <Form.Item name="is_physical" valuePropName="checked" noStyle initialValue={true}>
                                        <Switch
                                            checkedChildren={t("products.is_physical_yes")}
                                            unCheckedChildren={t("products.is_physical_no")}
                                        />
                                    </Form.Item>
                                </div>
                                {isPhysical !== false ? (
                                    <>
                                        <Row gutter={12}>
                                            <Col xs={16}>
                                                <Form.Item
                                                    name="weight_value"
                                                    label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">{t("products.weight")}</span>}
                                                    rules={[{ required: true, message: t("products.weight_required") }]}
                                                    className="mb-3"
                                                >
                                                    <InputNumber min={0.01} precision={2} size="large" className="w-full auth-ohnix-input" placeholder="0.00" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={8}>
                                                <Form.Item name="weight_unit" label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">&nbsp;</span>} initialValue="g" className="mb-3">
                                                    <Select size="large" className="auth-ohnix-input" options={[{ value: "g", label: "g" }, { value: "kg", label: "kg" }]} />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                        <Row gutter={12}>
                                            <Col xs={8}>
                                                <Form.Item
                                                    name="height_value"
                                                    label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">{t("products.height")}</span>}
                                                    rules={[{ required: true, message: t("products.dimensions_required") }]}
                                                    className="mb-3"
                                                >
                                                    <InputNumber min={0.01} precision={2} size="large" className="w-full auth-ohnix-input" placeholder="0.00" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={8}>
                                                <Form.Item
                                                    name="width_value"
                                                    label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">{t("products.width")}</span>}
                                                    rules={[{ required: true, message: t("products.dimensions_required") }]}
                                                    className="mb-3"
                                                >
                                                    <InputNumber min={0.01} precision={2} size="large" className="w-full auth-ohnix-input" placeholder="0.00" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={8}>
                                                <Form.Item
                                                    name="length_value"
                                                    label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">{t("products.length")}</span>}
                                                    rules={[{ required: true, message: t("products.dimensions_required") }]}
                                                    className="mb-3"
                                                >
                                                    <InputNumber min={0.01} precision={2} size="large" className="w-full auth-ohnix-input" placeholder="0.00" />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                        <Row gutter={12}>
                                            <Col xs={24} sm={12}>
                                                <Form.Item name="dimension_unit" label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">{t("products.dimension_unit")}</span>} initialValue="cm" className="mb-3">
                                                    <Select size="large" className="auth-ohnix-input" options={[{ value: "cm", label: "cm" }, { value: "m", label: "m" }]} />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={12}>
                                                <div className="flex flex-col justify-end h-full pb-3">
                                                    <span className="text-xs font-medium text-[var(--ohnix-text-muted)] mb-1">{t("products.volumetric_weight")}</span>
                                                    <span className="text-sm font-semibold text-[var(--ohnix-text-primary)]">
                                                        {volumetricWeightPreview !== null
                                                            ? `${volumetricWeightPreview.toFixed(2)} ${weightUnit}`
                                                            : "—"}
                                                    </span>
                                                </div>
                                            </Col>
                                        </Row>
                                        <Row gutter={12}>
                                            <Col xs={24} sm={8}>
                                                <Form.Item
                                                    name="units_per_package"
                                                    label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">{t("products.units_per_package")}</span>}
                                                    initialValue={1}
                                                    className="mb-3"
                                                >
                                                    <InputNumber min={1} precision={0} size="large" className="w-full auth-ohnix-input" />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={10}>
                                                <Form.Item
                                                    name="packaging_type"
                                                    label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">{t("products.packaging_type")}</span>}
                                                    initialValue="box"
                                                    className="mb-3"
                                                >
                                                    <Select
                                                        size="large"
                                                        className="auth-ohnix-input"
                                                        options={[
                                                            { value: "box", label: t("products.packaging_box") },
                                                            { value: "envelope", label: t("products.packaging_envelope") },
                                                            { value: "bag", label: t("products.packaging_bag") },
                                                            { value: "tube", label: t("products.packaging_tube") },
                                                            { value: "pallet", label: t("products.packaging_pallet") },
                                                        ]}
                                                    />
                                                </Form.Item>
                                            </Col>
                                            <Col xs={24} sm={6}>
                                                <Form.Item
                                                    name="is_fragile"
                                                    valuePropName="checked"
                                                    label={<span className="text-xs font-medium text-[var(--ohnix-text-muted)]">{t("products.is_fragile")}</span>}
                                                    className="mb-3"
                                                >
                                                    <Switch />
                                                </Form.Item>
                                            </Col>
                                        </Row>
                                        <Collapse
                                            ghost
                                            size="small"
                                            className="physical-package-collapse"
                                            items={[
                                                {
                                                    key: "package",
                                                    label: (
                                                        <span className="text-xs font-medium text-[var(--ohnix-text-muted)] inline-flex items-center gap-1.5">
                                                            <InboxOutlined />
                                                            {t("products.dispatch_package")}
                                                        </span>
                                                    ),
                                                    children: (
                                                        <>
                                                            <p className="text-xs text-[var(--ohnix-text-dim)] mb-3">
                                                                {t("products.dispatch_package_hint")}
                                                            </p>
                                                            <Row gutter={12}>
                                                                <Col xs={12} sm={6}>
                                                                    <Form.Item name="package_weight_value" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.weight")}</span>} className="mb-3">
                                                                        <InputNumber min={0.01} precision={2} size="large" className="w-full auth-ohnix-input" placeholder="—" />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col xs={12} sm={6}>
                                                                    <Form.Item name="package_height_value" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.height")}</span>} className="mb-3">
                                                                        <InputNumber min={0.01} precision={2} size="large" className="w-full auth-ohnix-input" placeholder="—" />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col xs={12} sm={6}>
                                                                    <Form.Item name="package_width_value" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.width")}</span>} className="mb-3">
                                                                        <InputNumber min={0.01} precision={2} size="large" className="w-full auth-ohnix-input" placeholder="—" />
                                                                    </Form.Item>
                                                                </Col>
                                                                <Col xs={12} sm={6}>
                                                                    <Form.Item name="package_length_value" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.length")}</span>} className="mb-0">
                                                                        <InputNumber min={0.01} precision={2} size="large" className="w-full auth-ohnix-input" placeholder="—" />
                                                                    </Form.Item>
                                                                </Col>
                                                            </Row>
                                                        </>
                                                    ),
                                                },
                                            ]}
                                        />
                                    </>
                                ) : (
                                    <p className="text-xs text-[var(--ohnix-text-dim)] mb-0">{t("products.not_physical_hint")}</p>
                                )}
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
                                        <span className="text-xs font-medium text-[var(--ohnix-text-muted)] inline-flex items-center gap-1.5">
                                            {t("products.low_stock_threshold")}
                                            {!can("configurableAlerts") && (
                                                <Tooltip title={t("products.low_stock_threshold_upsell")}>
                                                    <LockOutlined className="text-[var(--ohnix-text-dim)]" />
                                                </Tooltip>
                                            )}
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
                                        <Col xs={24}>
                                            {/* ET art. 424/476 (excluded) never causes VAT and has no tax
                                                code/rate at all; art. 477/478/481 (exempt) still carries the
                                                VAT code at a 0% rate - only "taxed" needs a real rate. */}
                                            <Form.Item
                                                name="tax_treatment"
                                                label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.tax_treatment")}</span>}
                                                extra={<span className="text-[var(--ohnix-text-dim)]">{t("products.tax_treatment_hint")}</span>}
                                                initialValue="taxed"
                                            >
                                                <Select
                                                    size="large"
                                                    className="auth-ohnix-input"
                                                    options={[
                                                        { value: "taxed", label: t("products.tax_treatment_taxed") },
                                                        { value: "excluded", label: t("products.tax_treatment_excluded") },
                                                        { value: "exempt", label: t("products.tax_treatment_exempt") },
                                                    ]}
                                                />
                                            </Form.Item>
                                        </Col>
                                        {taxTreatment !== "excluded" && (
                                            <Col xs={24} sm={12}>
                                                <Form.Item name="tax_code" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.dian_tax")}</span>} initialValue="01">
                                                    <Select size="large" className="auth-ohnix-input" options={[{ value: "01", label: t("customers.dian_tax_vat") }, { value: "04", label: "INC" }]} />
                                                </Form.Item>
                                            </Col>
                                        )}
                                        {taxTreatment === "taxed" && (
                                            <Col xs={24} sm={12}>
                                                {/* Defaults to Colombia's general VAT rate since this block only
                                                    renders for CO companies with electronic invoicing enabled. */}
                                                <Form.Item name="tax_rate" label={<span className="text-xs text-[var(--ohnix-text-muted)]">{t("products.dian_tax_rate")}</span>} initialValue={19}>
                                                    <InputNumber min={0} max={100} precision={2} size="large" className="w-full auth-ohnix-input" />
                                                </Form.Item>
                                            </Col>
                                        )}
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
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 mt-4 border-t border-[var(--ohnix-line-4)]">
                <Button
                    onClick={onCancel}
                    disabled={loading}
                    className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                >
                    {t("common.cancel")}
                </Button>
                <Button
                    type="primary"
                    onClick={onSave}
                    loading={loading}
                    className="h-10 px-6 min-w-[140px] rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                >
                    {t("products.save_product")}
                </Button>
            </div>
            <BarcodeScannerModal
                open={scannerOpen}
                onCancel={() => setScannerOpen(false)}
                onDetected={handleBarcodeDetected}
            />
        </Modal>
    );
};

export default ProductModal;
