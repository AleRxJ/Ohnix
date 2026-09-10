import React from "react";
import { Modal, Form, Row, Col, Select, Button, Divider, Card, DatePicker } from "antd";
import { PlusOutlined, ShoppingCartOutlined, FileTextOutlined } from "@ant-design/icons";
import OrderFormItems from "./OrderFormItems";
import PointOfSaleField from "../common/PointOfSaleField";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;

const sectionCardProps = {
    className: "shadow-sm border-0 module-shell",
    headStyle: {
        borderBottom: "1px solid var(--ohnix-line-3)",
        background: "transparent",
    },
};

const CreateOrderModal = ({
    visible,
    onCancel,
    onSubmit,
    customers,
    products,
    form,
    initialValues,
    isTourCreateStep,
    submitting,
}) => {
    const { t } = useI18n();
    const selectedPointOfSaleId = Form.useWatch("pointOfSaleId", form);

    // Customers are assigned to a single point of sale at creation (see
    // Backend/services/order.service.js's "pertenece a otro punto de venta"
    // check) - only offer the ones that match whatever location this order
    // is being placed for, same fix as PurchaseForm does for suppliers.
    const availableCustomers = React.useMemo(() => {
        if (!selectedPointOfSaleId) return customers;
        return customers.filter(
            (customer) => !customer.point_of_sale?._id || String(customer.point_of_sale._id) === String(selectedPointOfSaleId)
        );
    }, [customers, selectedPointOfSaleId]);

    React.useEffect(() => {
        if (isTourCreateStep || !selectedPointOfSaleId) return;
        const currentCustomerId = form.getFieldValue("customer_id");
        if (!currentCustomerId) return;
        const stillAvailable = availableCustomers.some((customer) => customer._id === currentCustomerId);
        if (!stillAvailable) form.setFieldsValue({ customer_id: undefined });
    }, [selectedPointOfSaleId, availableCustomers, isTourCreateStep, form]);

    return (
        <Modal
            title={
                <div className="flex items-center justify-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <ShoppingCartOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-xl uppercase tracking-wider font-bold text-[var(--ohnix-text-primary)]">
                        {t("orders.create_new_order")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={Math.min(880, window.innerWidth * 0.94)}
            centered
            destroyOnClose
            className="create-order-modal"
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
                    padding: "24px",
                    maxHeight: "75vh",
                    overflowY: "auto",
                },
            }}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={onSubmit}
                className="mt-6 space-y-6"
                initialValues={initialValues}
            >
                <Card
                    {...sectionCardProps}
                    title={
                        <div className="flex items-center text-[var(--ohnix-text-primary)]">
                            <FileTextOutlined className="mr-3 text-[#29D8D5] text-lg" />
                            <span className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                                {t("orders.order_information")}
                            </span>
                        </div>
                    }
                >
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <PointOfSaleField disabled={isTourCreateStep} />
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="customer_id"
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
                                        {t("customers.customer")}
                                    </span>
                                }
                                rules={[
                                    {
                                        required: true,
                                        message: t("orders.select_customer_message"),
                                    },
                                ]}
                                extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                            >
                                <Select
                                    placeholder={t("orders.select_customer")}
                                    showSearch
                                    optionFilterProp="children"
                                    className="w-full auth-ohnix-input"
                                    size="large"
                                    disabled={isTourCreateStep}
                                >
                                    {availableCustomers.map((customer) => (
                                        <Option
                                            key={customer._id}
                                            value={customer._id}
                                        >
                                            {customer.name}
                                        </Option>
                                    ))}
                                </Select>
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item name="due_date" label={<span className="font-medium text-[var(--ohnix-text-muted)]">{t("orders.due_date")}</span>} extra={t("orders.due_date_hint")}>
                                <DatePicker className="w-full" size="large" placeholder={t("orders.due_date_placeholder")} />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="order_status"
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
                                        {t("common.status")}
                                    </span>
                                }
                                initialValue="pending"
                                extra={isTourCreateStep ? t("inventory_tour.order_status_locked_hint") : undefined}
                            >
                                <Select size="large" disabled={isTourCreateStep}>
                                    <Option value="pending">{t("orders.pending")}</Option>
                                    <Option value="processing">
                                        {t("orders.processing")}
                                    </Option>
                                    <Option value="completed">{t("orders.completed")}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                <Form.List name="orderItems" initialValue={initialValues?.orderItems ?? [{}]}>
                    {(fields, { add, remove }) => (
                        <div>
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold text-[var(--ohnix-text-soft)] uppercase tracking-wide">
                                    {t("orders.order_items")}
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
                                    <OrderFormItems
                                        key={key}
                                        products={products}
                                        onRemove={() => remove(name)}
                                        name={name}
                                        restField={restField}
                                        locked={isTourCreateStep && name === 0}
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
                        {t("orders.create_order")}
                    </Button>
                </div>
            </Form>

        </Modal>
    );
};

export default CreateOrderModal;
