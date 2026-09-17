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
    Card,
    DatePicker,
} from "antd";
import {
    PlusOutlined,
    ShoppingCartOutlined,
    FileTextOutlined,
} from "@ant-design/icons";
import PurchaseFormItem from "./PurchaseFormItem";
import useI18n from "../../hooks/useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import PointOfSaleField, { usePointOfSaleFieldVisible } from "../common/PointOfSaleField";
import { accountingService } from "../../services/accountingService";

const { Option } = Select;

const sectionCardProps = {
    className: "shadow-sm border-0 module-shell",
    headStyle: {
        borderBottom: "1px solid var(--ohnix-line-3)",
        background: "transparent",
    },
};

const PurchaseForm = ({
    visible,
    onCancel,
    onSubmit,
    suppliers,
    products,
    form,
    initialValues,
    submitting,
    // Set when this modal opens as "convert quotation -> purchase" (see
    // QuotationList.jsx). Supplier and line items came from an already-
    // approved supplier quote, so they're pre-filled and locked here -
    // changing them would silently disconnect the resulting Purchase from
    // the prices that were actually quoted and compared. Only the purchase
    // number/status stay editable, same as a normal purchase.
    initialQuotation,
}) => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive, effectiveSteps, stepIndex } = useInventoryTour();
    const isTourCreateStep = isTutorialActive && effectiveSteps[stepIndex]?.id === "create-purchase";
    const isConvertingQuotation = Boolean(initialQuotation);
    const fieldsLocked = isTourCreateStep || isConvertingQuotation;
    const [withholdingConcepts, setWithholdingConcepts] = React.useState([]);
    const { visible: showPointOfSale } = usePointOfSaleFieldVisible();
    const selectedPointOfSaleId = Form.useWatch("pointOfSaleId", form);

    // Suppliers are assigned to a single point of sale at creation (see
    // Backend/services/purchase.service.js's "pertenece a otro punto de
    // venta" check) - only offer the ones that match whatever location this
    // purchase is being created for, so that check can never reject a
    // selection made here. Suppliers without a resolved location (or when
    // PointOfSaleField isn't rendered, ie. single-location accounts) are
    // left unfiltered since there's nothing to disambiguate against yet.
    const availableSuppliers = React.useMemo(() => {
        if (!selectedPointOfSaleId) return suppliers;
        return suppliers.filter(
            (supplier) => !supplier.point_of_sale?._id || String(supplier.point_of_sale._id) === String(selectedPointOfSaleId)
        );
    }, [suppliers, selectedPointOfSaleId]);

    React.useEffect(() => {
        if (fieldsLocked || !selectedPointOfSaleId) return;
        const currentSupplierId = form.getFieldValue("supplier_id");
        if (!currentSupplierId) return;
        const stillAvailable = availableSuppliers.some((supplier) => supplier._id === currentSupplierId);
        if (!stillAvailable) form.setFieldsValue({ supplier_id: undefined });
    }, [selectedPointOfSaleId, availableSuppliers, fieldsLocked, form]);

    React.useEffect(() => {
        if (!visible || isTourCreateStep) return;
        accountingService.listWithholdingConcepts({ activeAt: new Date().toISOString() })
            .then((response) => setWithholdingConcepts(response?.data || []))
            // Purchases exist on plans without Accounting; in that case the
            // accounting-gated endpoint correctly returns 403 and this
            // optional field simply stays hidden.
            .catch(() => setWithholdingConcepts([]));
    }, [visible, isTourCreateStep]);

    const handleProductChange = (productId, fieldName) => {
        const product = products.find((p) => p._id === productId);
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
            pointOfSaleId: values.pointOfSaleId,
            purchase_no: values.purchase_no,
            purchase_status: values.purchase_status || "pending",
            due_date: values.due_date ? values.due_date.endOf("day").toISOString() : null,
            details: values.details.map((detail) => ({
                product_id: detail.product_id,
                ...(detail.purchase_unit_quantity !== undefined
                    ? { purchase_unit_quantity: detail.purchase_unit_quantity, purchase_unit_cost: detail.purchase_unit_cost }
                    : { quantity: detail.quantity, unitcost: detail.unitcost }),
                ...(detail.batch_number !== undefined && {
                    batch_number: detail.batch_number,
                    batch_expiration_date: detail.batch_expiration_date ? detail.batch_expiration_date.toISOString() : null,
                }),
            })),
            withholding_concept_ids: values.withholding_concept_ids || [],
            ...(isConvertingQuotation && { source_quotation_id: initialQuotation.id }),
        };
        onSubmit(purchaseData);
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <ShoppingCartOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {isConvertingQuotation ? t("quotations.convert_modal_title") : t("purchases.add_new_purchase")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={880}
            centered
            className="purchase-form-modal"
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
                body: { padding: "24px", maxHeight: "75vh", overflowY: "auto" },
            }}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                initialValues={initialValues}
                className="mt-2 space-y-6"
            >
                <Card
                    {...sectionCardProps}
                    title={
                        <div className="flex items-center text-[var(--ohnix-text-primary)]">
                            <FileTextOutlined className="mr-3 text-[#29D8D5] text-lg" />
                            <span className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                                {t("purchases.purchase_information")}
                            </span>
                        </div>
                    }
                >
                    <Row gutter={16}>
                        {showPointOfSale && (
                            <Col xs={24} sm={12}>
                                <PointOfSaleField disabled={fieldsLocked} />
                            </Col>
                        )}
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
                                        {t("purchases.purchase_number")}
                                    </span>
                                }
                                name="purchase_no"
                                rules={[
                                    { required: true, message: t("purchases.enter_purchase_number") },
                                    { max: 10, message: t("purchases.purchase_number_max_length") },
                                ]}
                            >
                                <Input
                                    placeholder={t("purchases.purchase_number_placeholder")}
                                    size="large"
                                    className="w-full auth-ohnix-input"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
                                        {t("purchases.supplier")}
                                    </span>
                                }
                                name="supplier_id"
                                rules={[{ required: true, message: t("purchases.select_supplier_message") }]}
                                extra={
                                    isTourCreateStep
                                        ? t("inventory_tour.practice_locked_hint")
                                        : isConvertingQuotation
                                          ? t("quotations.convert_supplier_locked_hint")
                                          : undefined
                                }
                            >
                                <Select
                                    placeholder={t("purchases.select_supplier")}
                                    size="large"
                                    className="w-full auth-ohnix-input"
                                    showSearch
                                    optionFilterProp="children"
                                    disabled={fieldsLocked}
                                >
                                    {availableSuppliers.map((supplier) => (
                                        <Option key={supplier._id} value={supplier._id}>
                                            {supplier.shopname ? `${supplier.name} (${supplier.shopname})` : supplier.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="due_date" label={<span className="font-medium text-[var(--ohnix-text-muted)]">{t("purchases.due_date")}</span>} extra={t("purchases.due_date_hint")}>
                                <DatePicker className="w-full" size="large" placeholder={t("purchases.due_date_placeholder")} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
                                        {t("common.status")}
                                    </span>
                                }
                                name="purchase_status"
                                extra={isTourCreateStep ? t("inventory_tour.purchase_status_locked_hint") : undefined}
                            >
                                <Select
                                    placeholder={t("purchases.select_status")}
                                    size="large"
                                    className="w-full auth-ohnix-input"
                                    disabled={isTourCreateStep}
                                >
                                    <Option value="pending">{t("purchases.pending")}</Option>
                                    <Option value="completed">{t("purchases.completed")}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                    {withholdingConcepts.length > 0 && (
                        <Form.Item
                            name="withholding_concept_ids"
                            label={t("purchases.withholding_concepts")}
                            extra={t("purchases.withholding_concepts_hint")}
                        >
                            <Select
                                mode="multiple"
                                allowClear
                                optionFilterProp="label"
                                options={withholdingConcepts.map((concept) => ({
                                    value: concept.id,
                                    label: `${concept.code} · ${concept.name} (${concept.rate_percent}%)`,
                                }))}
                            />
                        </Form.Item>
                    )}
                </Card>

                <Form.List name="details">
                    {(fields, { add, remove }) => (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">
                                    {t("purchases.purchase_details")}
                                </h4>
                                {!isConvertingQuotation && (
                                    <Button
                                        type="primary"
                                        onClick={() => add()}
                                        icon={<PlusOutlined />}
                                        size="middle"
                                        className="font-medium"
                                    >
                                        {t("common.add_item")}
                                    </Button>
                                )}
                            </div>
                            {isConvertingQuotation && (
                                <p className="mb-4 text-xs text-[var(--ohnix-text-muted)]">{t("quotations.convert_lines_locked_hint")}</p>
                            )}
                            <div className="space-y-4">
                                {fields.map(({ key, name, ...restField }) => (
                                    <PurchaseFormItem
                                        key={key}
                                        products={products}
                                        onRemove={() => remove(name)}
                                        name={name}
                                        restField={restField}
                                        locked={fieldsLocked}
                                        hideRemove={isConvertingQuotation}
                                        onProductChange={handleProductChange}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </Form.List>

                <Divider className="my-6" />

                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-[var(--ohnix-line-4)]">
                    <Button
                        onClick={onCancel}
                        disabled={submitting}
                        className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                    >
                        {t("common.cancel")}
                    </Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        loading={submitting}
                        className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                    >
                        {isConvertingQuotation ? t("quotations.confirm_convert") : t("purchases.create_purchase")}
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

export default PurchaseForm;
