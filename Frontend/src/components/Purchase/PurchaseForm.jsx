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
} from "antd";
import {
    PlusOutlined,
    ShoppingCartOutlined,
    FileTextOutlined,
} from "@ant-design/icons";
import PurchaseFormItem from "./PurchaseFormItem";
import useI18n from "../../hooks/useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";

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
}) => {
    const { t } = useI18n();
    const { isOpen: isTutorialActive, effectiveSteps, stepIndex } = useInventoryTour();
    const isTourCreateStep = isTutorialActive && effectiveSteps[stepIndex]?.id === "create-purchase";

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
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <ShoppingCartOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">{t("purchases.add_new_purchase")}</span>
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
                                extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                            >
                                <Select
                                    placeholder={t("purchases.select_supplier")}
                                    size="large"
                                    className="w-full auth-ohnix-input"
                                    showSearch
                                    optionFilterProp="children"
                                    disabled={isTourCreateStep}
                                >
                                    {suppliers.map((supplier) => (
                                        <Option key={supplier._id} value={supplier._id}>
                                            {supplier.shopname ? `${supplier.name} (${supplier.shopname})` : supplier.name}
                                        </Option>
                                    ))}
                                </Select>
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
                </Card>

                <Form.List name="details">
                    {(fields, { add, remove }) => (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">
                                    {t("purchases.purchase_details")}
                                </h4>
                                <Button
                                    type="primary"
                                    onClick={() => add()}
                                    icon={<PlusOutlined />}
                                    size="middle"
                                    className="font-medium"
                                >
                                    {t("common.add_item")}
                                </Button>
                            </div>
                            <div className="space-y-4">
                                {fields.map(({ key, name, ...restField }) => (
                                    <PurchaseFormItem
                                        key={key}
                                        products={products}
                                        onRemove={() => remove(name)}
                                        name={name}
                                        restField={restField}
                                        locked={isTourCreateStep && name === 0}
                                        onProductChange={handleProductChange}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                </Form.List>

                <Divider className="my-6" />

                <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                    <Button
                        onClick={onCancel}
                        disabled={submitting}
                        size="large"
                        className="w-full sm:w-auto min-w-[120px]"
                    >
                        {t("common.cancel")}
                    </Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        loading={submitting}
                        size="large"
                        className="w-full sm:w-auto min-w-[120px] font-medium"
                    >
                        {t("purchases.create_purchase")}
                    </Button>
                </div>
            </Form>
        </Modal>
    );
};

export default PurchaseForm;
