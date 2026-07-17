import { Modal, Form, Row, Col, Select, Button, Divider } from "antd";
import { PlusOutlined } from "@ant-design/icons";
import OrderFormItems from "./OrderFormItems";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;

const CreateOrderModal = ({
    visible,
    onCancel,
    onSubmit,
    customers,
    products,
    form,
}) => {
    const { t } = useI18n();
    return (
        <Modal
            title={
                <div className="text-xl text-center uppercase tracking-wider font-bold text-gray-900">
                    {t("orders.create_new_order")}
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={800}
            centered
            destroyOnClose
            className="create-order-modal"
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={onSubmit}
                className="mt-6"
            >
                <div className="mb-6">
                    <h4 className="text-sm font-semibold text-gray-700 mb-4 uppercase tracking-wide">
                        {t("orders.order_information")}
                    </h4>
                    <Row gutter={16}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                name="customer_id"
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("customers.customer")}
                                    </span>
                                }
                                rules={[
                                    {
                                        required: true,
                                        message: t("orders.select_customer_message"),
                                    },
                                ]}
                            >
                                <Select
                                    placeholder={t("customers.select_customer")}
                                    showSearch
                                    optionFilterProp="children"
                                    className="w-full"
                                    size="large"
                                >
                                    {customers.map((customer) => (
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
                            <Form.Item
                                name="order_status"
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("common.status")}
                                    </span>
                                }
                                initialValue="pending"
                            >
                                <Select size="large">
                                    <Option value="pending">{t("orders.pending")}</Option>
                                    <Option value="processing">
                                        {t("orders.processing")}
                                    </Option>
                                    <Option value="completed">{t("orders.completed")}</Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </div>

                <Divider className="my-6" />

                <Form.List name="orderItems" initialValue={[{}]}>
                    {(fields, { add, remove }) => (
                        <div className="mb-6">
                            <div className="flex items-center justify-between mb-4">
                                <h4 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
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
                        size="large"
                        className="w-full sm:w-auto min-w-[120px]"
                    >
                        {t("common.cancel")}
                    </Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        size="large"
                        className="w-full sm:w-auto min-w-[120px] font-medium"
                    >
                        {t("orders.create_order")}
                    </Button>
                </div>
            </Form>

            <style jsx>{`
                .create-order-modal :global(.ant-modal-header) {
                    border-bottom: 1px solid #f0f0f0;
                    padding: 20px 24px;
                }
                .create-order-modal :global(.ant-modal-body) {
                    padding: 24px;
                    max-height: calc(100vh - 200px);
                    overflow-y: auto;
                }
                .create-order-modal :global(.ant-form-item-label > label) {
                    font-size: 14px;
                }
                @media (max-width: 640px) {
                    .create-order-modal :global(.ant-modal) {
                        max-width: calc(100vw - 32px);
                        margin: 16px;
                    }
                    .create-order-modal :global(.ant-modal-body) {
                        padding: 16px;
                        max-height: calc(100vh - 150px);
                    }
                }
            `}</style>
        </Modal>
    );
};

export default CreateOrderModal;
