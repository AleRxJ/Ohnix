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
                        <div className="flex items-center text-white">
                            <UserOutlined className="mr-3 text-[#29D8D5] text-lg" />
                            <span className="text-lg font-semibold text-white">
                                {t("customers.personal_information")}
                            </span>
                        </div>
                    }
                    className="shadow-sm border-0 module-shell"
                    headStyle={{
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "transparent",
                    }}
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[#A9B3B8]">
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
                                        <UserOutlined className="text-[#8B98A0]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[#A9B3B8]">
                                        {t("customers.customer_type")}
                                    </span>
                                }
                                name="type"
                                initialValue="regular"
                            >
                                <Select
                                    placeholder={t("customers.select_customer_type")}
                                    size="large"
                                    className="rounded-lg auth-ohnix-input"
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
                        <div className="flex items-center text-white">
                            <MailOutlined className="mr-3 text-[#44F3F0] text-lg" />
                            <span className="text-lg font-semibold text-white">
                                {t("customers.contact_information")}
                            </span>
                        </div>
                    }
                    className="shadow-sm border-0 module-shell"
                    headStyle={{
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "transparent",
                    }}
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[#A9B3B8]">
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
                                        <MailOutlined className="text-[#8B98A0]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[#A9B3B8]">
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
                                        <PhoneOutlined className="text-[#8B98A0]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[#A9B3B8]">
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
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* Business Information Section */}
                <Card
                    title={
                        <div className="flex items-center justify-between">
                            <div className="flex items-center text-white">
                                <ShopOutlined className="mr-3 text-[#29D8D5] text-lg" />
                                <span className="text-lg font-semibold text-white">
                                    {t("customers.business_information")}
                                </span>
                            </div>
                            <span className="text-sm font-normal text-[#A9B3B8] bg-white/[0.04] px-3 py-1 rounded-full border border-white/8">
                                {t("customers.optional")}
                            </span>
                        </div>
                    }
                    className="shadow-sm border-0 module-shell"
                    headStyle={{
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "transparent",
                    }}
                >
                    <Row gutter={[24, 16]}>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[#A9B3B8]">
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
                                        <ShopOutlined className="text-[#8B98A0]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24} sm={12}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[#A9B3B8]">
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
                                        <IdcardOutlined className="text-[#8B98A0]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Col>
                        <Col xs={24}>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[#A9B3B8]">
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
                                        <BankOutlined className="text-[#8B98A0]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Col>
                    </Row>
                </Card>

                {/* Photo Upload Section */}
                <Card
                    title={
                        <div className="flex items-center text-white">
                            <UploadOutlined className="mr-3 text-[#44F3F0] text-lg" />
                            <span className="text-lg font-semibold text-white">
                                {t("customers.customer_photo")}
                            </span>
                        </div>
                    }
                    className="shadow-sm border-0 module-shell"
                    headStyle={{
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        background: "transparent",
                    }}
                >
                    <Form.Item>
                        <Upload {...uploadProps}>
                            {fileList.length === 0 && (
                                <div className="text-center md:p-2 mt-2 border border-dashed border-white/12 rounded-xl hover:border-[#29D8D5]/60 transition-all duration-200 cursor-pointer bg-white/[0.03] hover:bg-white/[0.05]">
                                    <UploadOutlined className="text-3xl text-[#29D8D5] mb-3 block" />
                                    <div className="text-white font-medium mb-1">
                                        {t("customers.click_to_upload_photo")}
                                    </div>
                                    <div className="text-sm text-[#A9B3B8]">
                                        {t("customers.photo_upload_help")}
                                    </div>
                                </div>
                            )}
                        </Upload>
                    </Form.Item>
                </Card>

                {/* Form Actions */}
                <div className="flex justify-end pt-6 border-t border-white/10 bg-white/[0.02] -mx-6 px-6 py-4 space-x-3">
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
                        className="min-w-32 h-10 rounded-lg font-medium bg-[#29D8D5] hover:bg-[#23c1be] border-[#29D8D5] text-black"
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
                    color: rgba(255, 255, 255, 0.72);
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
