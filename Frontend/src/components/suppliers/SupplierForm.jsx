import React from "react";
import {
    Modal,
    Form,
    Input,
    Upload,
    Button,
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
            title={
                <div className="text-lg font-semibold text-white">
                    {editMode
                        ? t("suppliers.edit_supplier")
                        : t("suppliers.add_new_supplier")}
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={Math.min(880, window.innerWidth * 0.94)}
            centered
            className="supplier-modal"
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
                body: { padding: "20px 24px 24px" },
            }}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={onSubmit}
                autoComplete="off"
                className="space-y-6"
                size="large"
            >
                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="name"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.supplier_name")}
                                </span>
                            }
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
                                prefix={
                                    <UserOutlined className="text-[#8B98A0] text-sm" />
                                }
                                placeholder={t("suppliers.enter_supplier_name_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="email"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.email")}
                                </span>
                            }
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
                                prefix={
                                    <MailOutlined className="text-[#8B98A0] text-sm" />
                                }
                                placeholder={t("suppliers.enter_email_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="phone"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.phone")}
                                </span>
                            }
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
                                prefix={
                                    <PhoneOutlined className="text-[#8B98A0] text-sm" />
                                }
                                placeholder={t("suppliers.enter_phone_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="type"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.supplier_type")}
                                </span>
                            }
                        >
                            <Select
                                placeholder={t("suppliers.select_supplier_type")}
                                className="auth-ohnix-input"
                            >
                                <Option value="individual">{t("suppliers.individual")}</Option>
                                <Option value="wholesale">{t("suppliers.wholesale")}</Option>
                                <Option value="retail">{t("suppliers.retail")}</Option>
                                <Option value="company">{t("suppliers.company")}</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="shopname"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.shop_name")}
                                </span>
                            }
                            rules={[
                                {
                                    max: 50,
                                    message: t("suppliers.shop_name_max_length"),
                                },
                            ]}
                        >
                            <Input
                                prefix={
                                    <ShopOutlined className="text-[#8B98A0] text-sm" />
                                }
                                placeholder={t("suppliers.enter_shop_name_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="address"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("common.address")}
                                </span>
                            }
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
                            <Input
                                placeholder={t("suppliers.enter_address_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Divider className="border-white/10 text-white/80">
                    {t("suppliers.banking_information")}
                </Divider>

                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="bank_name"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.bank_name")}
                                </span>
                            }
                            rules={[
                                {
                                    max: 50,
                                    message: t("suppliers.bank_name_max_length"),
                                },
                            ]}
                        >
                            <Input
                                prefix={
                                    <BankOutlined className="text-[#8B98A0] text-sm" />
                                }
                                placeholder={t("suppliers.enter_bank_name_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="account_holder"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.account_holder")}
                                </span>
                            }
                            rules={[
                                {
                                    max: 50,
                                    message: t("suppliers.account_holder_max_length"),
                                },
                            ]}
                        >
                            <Input
                                placeholder={t("suppliers.enter_account_holder_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="account_number"
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.account_number")}
                                </span>
                            }
                            rules={[
                                {
                                    max: 50,
                                    message: t("suppliers.account_number_max_length"),
                                },
                            ]}
                        >
                            <Input
                                placeholder={t("suppliers.enter_account_number_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            label={
                                <span className="text-sm font-medium text-[#A9B3B8]">
                                    {t("suppliers.supplier_photo")}
                                </span>
                            }
                        >
                            <Upload {...uploadProps}>
                                {fileList.length === 0 && (
                                    <div className="text-center mt-2 border border-dashed border-white/12 rounded-xl hover:border-[#29D8D5]/60 transition-all duration-200 cursor-pointer bg-white/[0.03] hover:bg-white/[0.05] p-4 min-h-[120px] flex flex-col items-center justify-center">
                                        <UploadOutlined className="text-3xl text-[#29D8D5] mb-3 block" />
                                        <div className="text-white font-medium mb-1">
                                            {t("suppliers.upload_photo")}
                                        </div>
                                        <div className="text-sm text-[#A9B3B8]">
                                            JPG, PNG hasta 2MB
                                        </div>
                                    </div>
                                )}
                            </Upload>
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item className="mb-0">
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-white/10">
                        <Button
                            onClick={onCancel}
                            className="h-10 px-6 rounded-md bg-white/[0.04] border-white/10 text-white hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                        >
                            {t("common.cancel")}
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                        >
                            {editMode ? t("suppliers.update_supplier") : t("suppliers.create_supplier")}
                        </Button>
                    </div>
                </Form.Item>

            </Form>
        </Modal>
    );
};

export default SupplierForm;
