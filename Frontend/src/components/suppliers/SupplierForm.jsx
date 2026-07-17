import React from "react";
import {
    Modal,
    Form,
    Input,
    Upload,
    Button,
    Space,
    Row,
    Col,
    Select,
    Divider,
} from "antd";
import {
    UserOutlined,
    ShopOutlined,
    PhoneOutlined,
    MailOutlined,
    BankOutlined,
    UploadOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;

const SupplierForm = ({
    visible,
    onCancel,
    onSubmit,
    form,
    editMode,
    fileList,
    uploadProps,
}) => {
    const { t } = useI18n();
    return (
        <Modal
            title={editMode ? t("suppliers.edit_supplier") : t("suppliers.add_new_supplier")}
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={800}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={onSubmit}
                autoComplete="off"
            >
                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="name"
                            label={t("suppliers.supplier_name")}
                            rules={[
                                {
                                    required: true,
                                    message: t("suppliers.enter_supplier_name"),
                                },
                                {
                                    max: 50,
                                    message: t("suppliers.name_max_length"),
                                },
                            ]}
                        >
                            <Input
                                prefix={<UserOutlined />}
                                placeholder={t("suppliers.enter_supplier_name_placeholder")}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="email"
                            label={t("suppliers.email")}
                            rules={[
                                {
                                    required: true,
                                    message: t("suppliers.enter_email"),
                                },
                                {
                                    type: "email",
                                    message: t("validation.invalid_email"),
                                },
                                {
                                    max: 50,
                                    message: t("suppliers.email_max_length"),
                                },
                            ]}
                        >
                            <Input
                                prefix={<MailOutlined />}
                                placeholder={t("suppliers.enter_email_placeholder")}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="phone"
                            label={t("suppliers.phone")}
                            rules={[
                                {
                                    required: true,
                                    message: t("suppliers.enter_phone"),
                                },
                                {
                                    max: 15,
                                    message: t("suppliers.phone_max_length"),
                                },
                            ]}
                        >
                            <Input
                                prefix={<PhoneOutlined />}
                                placeholder={t("suppliers.enter_phone_placeholder")}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="type" label={t("suppliers.supplier_type")}>
                            <Select placeholder={t("suppliers.select_supplier_type")}>
                                <Option value="individual">{t("suppliers.individual")}</Option>
                                <Option value="wholesale">{t("suppliers.wholesale")}</Option>
                                <Option value="retail">{t("suppliers.retail")}</Option>
                                <Option value="company">{t("suppliers.company")}</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="shopname"
                            label={t("suppliers.shop_name")}
                            rules={[
                                {
                                    max: 50,
                                    message: t("suppliers.shop_name_max_length"),
                                },
                            ]}
                        >
                            <Input
                                prefix={<ShopOutlined />}
                                placeholder={t("suppliers.enter_shop_name_placeholder")}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="address"
                            label={t("common.address")}
                            rules={[
                                {
                                    required: true,
                                    message: t("suppliers.enter_address"),
                                },
                                {
                                    max: 100,
                                    message: t("suppliers.address_max_length"),
                                },
                            ]}
                        >
                            <Input placeholder={t("suppliers.enter_address_placeholder")} />
                        </Form.Item>
                    </Col>
                </Row>

                <Divider>{t("suppliers.banking_information")}</Divider>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="bank_name"
                            label={t("suppliers.bank_name")}
                            rules={[
                                {
                                    max: 50,
                                    message: t("suppliers.bank_name_max_length"),
                                },
                            ]}
                        >
                            <Input
                                prefix={<BankOutlined />}
                                placeholder={t("suppliers.enter_bank_name_placeholder")}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item
                            name="account_holder"
                            label={t("suppliers.account_holder")}
                            rules={[
                                {
                                    max: 50,
                                    message: t("suppliers.account_holder_max_length"),
                                },
                            ]}
                        >
                            <Input placeholder={t("suppliers.enter_account_holder_placeholder")} />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={16}>
                    <Col span={12}>
                        <Form.Item
                            name="account_number"
                            label={t("suppliers.account_number")}
                            rules={[
                                {
                                    max: 50,
                                    message: t("suppliers.account_number_max_length"),
                                },
                            ]}
                        >
                            <Input placeholder={t("suppliers.enter_account_number_placeholder")} />
                        </Form.Item>
                    </Col>
                    <Col span={12}>
                        <Form.Item name="photo" label={t("suppliers.supplier_photo")}>
                            <Upload {...uploadProps} maxCount={1}>
                                <Button icon={<UploadOutlined />}>
                                    {t("suppliers.upload_photo")}
                                </Button>
                            </Upload>
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item className="mb-0 mt-4">
                    <Space className="w-full justify-end">
                        <Button onClick={onCancel}>{t("common.cancel")}</Button>
                        <Button type="primary" htmlType="submit">
                            {editMode ? t("suppliers.update_supplier") : t("suppliers.create_supplier")}
                        </Button>
                    </Space>
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default SupplierForm;
