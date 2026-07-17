import React from "react";
import {
    Form,
    Input,
    Select,
    Upload,
    Row,
    Col,
    Button,
    Space,
    Card,
} from "antd";
import {
    UploadOutlined,
    UserOutlined,
    MailOutlined,
    PhoneOutlined,
    ShopOutlined,
    HomeOutlined,
    BankOutlined,
    IdcardOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;
const { TextArea } = Input;

const CustomerForm = ({
    form,
    onSubmit,
    onCancel,
    loading,
    fileList,
    setFileList,
    editingCustomer,
}) => {
    const { t } = useI18n();
    const uploadProps = {
        fileList,
        onChange: ({ fileList: newFileList }) => setFileList(newFileList),
        beforeUpload: () => false,
        maxCount: 1,
        accept: "image/*",
        listType: "picture-card",
        className: "avatar-uploader",
    };

    return (
        <div className="min-h-full">
            <Form
                form={form}
                layout="vertical"
                onFinish={onSubmit}
                scrollToFirstError
                className="space-y-6"
            >
                {/* Personal Information Section */}
                <Card
                    title={
                        <div className="flex items-center text-gray-800">
                            <UserOutlined className="mr-3 text-blue-600 text-lg" />
                            <span className="text-lg font-semibold">
                                {t("customers.personal_information")}
                            </span>
                        </div>
                    }
                    className="shadow-sm border-0"
                    headStyle={{
                        borderBottom: "2px solid #f0f0f0",
                        background: "#fafafa",
                    }}
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("customers.customer_name")}
                                    </span>
                                }
                                name="name"
                                rules={[
                                    {
                                        required: true,
                                        message: t("customers.enter_customer_name"),
                                    },
                                    {
                                        max: 50,
                                        message: t("customers.name_max_length"),
                                    },
                                ]}
                            >
                                <Input
                                    placeholder={t("customers.enter_full_name")}
                                    size="large"
                                    prefix={
                                        <UserOutlined className="text-gray-400" />
                                    }
                                    className="rounded-lg"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("customers.customer_type")}
                                    </span>
                                }
                                name="type"
                                initialValue="regular"
                            >
                                <Select
                                    placeholder={t("customers.select_customer_type")}
                                    size="large"
                                    className="rounded-lg"
                                >
                                    <Option value="regular">
                                        {t("customers.regular_customer")}
                                    </Option>
                                    <Option value="wholesale">
                                        {t("customers.wholesale_customer")}
                                    </Option>
                                    <Option value="retail">
                                        {t("customers.retail_customer")}
                                    </Option>
                                </Select>
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* Contact Information Section */}
                <Card
                    title={
                        <div className="flex items-center text-gray-800">
                            <MailOutlined className="mr-3 text-green-600 text-lg" />
                            <span className="text-lg font-semibold">
                                {t("customers.contact_information")}
                            </span>
                        </div>
                    }
                    className="shadow-sm border-0"
                    headStyle={{
                        borderBottom: "2px solid #f0f0f0",
                        background: "#fafafa",
                    }}
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("customers.email_address")}
                                    </span>
                                }
                                name="email"
                                rules={[
                                    {
                                        required: true,
                                        message: t("customers.enter_email_address"),
                                    },
                                    {
                                        type: "email",
                                        message: t("validation.invalid_email"),
                                    },
                                    {
                                        max: 50,
                                        message: t("customers.email_max_length"),
                                    },
                                ]}
                            >
                                <Input
                                    placeholder={t("customers.email_placeholder")}
                                    size="large"
                                    prefix={
                                        <MailOutlined className="text-gray-400" />
                                    }
                                    className="rounded-lg"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("customers.phone_number")}
                                    </span>
                                }
                                name="phone"
                                rules={[
                                    {
                                        required: true,
                                        message: t("customers.enter_phone_number"),
                                    },
                                    {
                                        max: 15,
                                        message: t("customers.phone_max_length"),
                                    },
                                ]}
                            >
                                <Input
                                    placeholder={t("customers.phone_placeholder")}
                                    size="large"
                                    prefix={
                                        <PhoneOutlined className="text-gray-400" />
                                    }
                                    className="rounded-lg"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("common.address")}
                                    </span>
                                }
                                name="address"
                                rules={[
                                    {
                                        max: 100,
                                        message: t("customers.address_max_length"),
                                    },
                                ]}
                            >
                                <TextArea
                                    placeholder={t("customers.address_placeholder")}
                                    rows={3}
                                    size="large"
                                    className="rounded-lg"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* Business Information Section */}
                <Card
                    title={
                        <div className="flex items-center justify-between">
                            <div className="flex items-center text-gray-800">
                                <ShopOutlined className="mr-3 text-purple-600 text-lg" />
                                <span className="text-lg font-semibold">
                                    {t("customers.business_information")}
                                </span>
                            </div>
                            <span className="text-sm font-normal text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                                {t("customers.optional")}
                            </span>
                        </div>
                    }
                    className="shadow-sm border-0"
                    headStyle={{
                        borderBottom: "2px solid #f0f0f0",
                        background: "#fafafa",
                    }}
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("customers.store_name")}
                                    </span>
                                }
                                name="store_name"
                                rules={[
                                    {
                                        max: 50,
                                        message: t("customers.store_name_max_length"),
                                    },
                                ]}
                            >
                                <Input
                                    placeholder={t("customers.store_name_placeholder")}
                                    size="large"
                                    prefix={
                                        <ShopOutlined className="text-gray-400" />
                                    }
                                    className="rounded-lg"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("customers.account_holder")}
                                    </span>
                                }
                                name="account_holder"
                                rules={[
                                    {
                                        max: 50,
                                        message: t("customers.account_holder_max_length"),
                                    },
                                ]}
                            >
                                <Input
                                    placeholder={t("customers.account_holder_placeholder")}
                                    size="large"
                                    prefix={
                                        <IdcardOutlined className="text-gray-400" />
                                    }
                                    className="rounded-lg"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-gray-700">
                                        {t("customers.account_number")}
                                    </span>
                                }
                                name="account_number"
                                rules={[
                                    {
                                        max: 50,
                                        message: t("customers.account_number_max_length"),
                                    },
                                ]}
                            >
                                <Input
                                    placeholder={t("customers.account_number_placeholder")}
                                    size="large"
                                    prefix={
                                        <BankOutlined className="text-gray-400" />
                                    }
                                    className="rounded-lg"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* Photo Upload Section */}
                <Card
                    title={
                        <div className="flex items-center text-gray-800">
                            <UploadOutlined className="mr-3 text-indigo-600 text-lg" />
                            <span className="text-lg font-semibold">
                                {t("customers.customer_photo")}
                            </span>
                        </div>
                    }
                    className="shadow-sm border-0"
                    headStyle={{
                        borderBottom: "2px solid #f0f0f0",
                        background: "#fafafa",
                    }}
                >
                    <Form.Item>
                        <Upload {...uploadProps}>
                            {fileList.length === 0 && (
                                <div className="text-center md:p-2 mt-2 border-2 border-dashed border-gray-300 rounded-xl hover:border-indigo-400 transition-all duration-200 cursor-pointer bg-gray-50 hover:bg-indigo-50">
                                    <UploadOutlined className="text-3xl text-gray-400 mb-3 block" />
                                    <div className="text-gray-700 font-medium mb-1">
                                        {t("customers.click_to_upload_photo")}
                                    </div>
                                    <div className="text-sm text-gray-500">
                                        {t("customers.photo_upload_help")}
                                    </div>
                                </div>
                            )}
                        </Upload>
                    </Form.Item>
                </Card>

                {/* Form Actions */}
                <div className="flex justify-end pt-6 border-t bg-gray-50 -mx-6 px-6 py-4 space-x-3">
                    <Button
                        size="large"
                        onClick={onCancel}
                        className="min-w-24 h-10 rounded-lg font-medium"
                    >
                        {t("common.cancel")}
                    </Button>
                    <Button
                        type="primary"
                        htmlType="submit"
                        loading={loading}
                        size="large"
                        className="min-w-32 h-10 rounded-lg font-medium bg-blue-600 hover:bg-blue-700 border-blue-600"
                    >
                        {editingCustomer ? t("customers.update_customer") : t("customers.add_customer")}
                    </Button>
                </div>
            </Form>

            <style jsx>{`
                .avatar-uploader .ant-upload-select {
                    width: 120px !important;
                    height: 120px !important;
                    border-radius: 12px !important;
                }
                .ant-card-head {
                    min-height: auto;
                    padding: 16px 24px;
                }
                .ant-card-body {
                    padding: 24px;
                }
                .ant-form-item-label > label {
                    height: auto;
                }
                .ant-input-affix-wrapper {
                    border-radius: 8px;
                }
                .ant-select-selector {
                    border-radius: 8px !important;
                }
                .ant-input {
                    border-radius: 8px;
                }
            `}</style>
        </div>
    );
};

export default CustomerForm;
