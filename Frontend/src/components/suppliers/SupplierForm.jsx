import React, { useContext, useEffect } from "react";
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
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";

const { Option } = Select;

const SupplierForm = ({
    visible,
    onCancel,
    onSubmit,
    form,
    editMode,
    editingSupplier,
    fileList,
    uploadProps,
    isTourCreateStep,
    submitting,
}) => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { team } = useTeam();
    const { viewers, lock, acquireLock, releaseLock } = useResourcePresence({
        resourceType: "supplier",
        resourceId: editingSupplier?._id,
        active: visible && Boolean(team) && Boolean(editingSupplier?._id),
    });

    useEffect(() => {
        if (visible && editingSupplier?._id && team) acquireLock();
        if (!visible) releaseLock();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, editingSupplier?._id]);

    return (
        <Modal
            title={
                <div className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
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
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            {team && editingSupplier?._id && (
                <PresenceLockBar viewers={viewers} lock={lock} currentUserId={user?.id} />
            )}
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
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                            extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                        >
                            <Input
                                prefix={
                                    <UserOutlined className="text-[var(--ohnix-text-dim)] text-sm" />
                                }
                                placeholder={t("suppliers.enter_supplier_name_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                                disabled={isTourCreateStep}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="email"
                            label={
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                                    <MailOutlined className="text-[var(--ohnix-text-dim)] text-sm" />
                                }
                                placeholder={t("suppliers.enter_email_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                                disabled={isTourCreateStep}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="phone"
                            label={
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                                    <PhoneOutlined className="text-[var(--ohnix-text-dim)] text-sm" />
                                }
                                placeholder={t("suppliers.enter_phone_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                                disabled={isTourCreateStep}
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="type"
                            label={
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                                    <ShopOutlined className="text-[var(--ohnix-text-dim)] text-sm" />
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
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                            extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                        >
                            <Input
                                placeholder={t("suppliers.enter_address_placeholder")}
                                className="h-11 rounded-md auth-ohnix-input"
                                disabled={isTourCreateStep}
                            />
                        </Form.Item>
                    </Col>
                </Row>

                <Divider className="border-[var(--ohnix-line-4)] text-[var(--ohnix-text-soft)]">
                    {t("suppliers.banking_information")}
                </Divider>

                <Row gutter={[16, 16]}>
                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="bank_name"
                            label={
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                                    <BankOutlined className="text-[var(--ohnix-text-dim)] text-sm" />
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
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
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
                                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
                                    {t("suppliers.supplier_photo")}
                                </span>
                            }
                        >
                            <Upload {...uploadProps}>
                                {fileList.length === 0 && (
                                    <div className="text-center mt-2 border border-dashed border-[var(--ohnix-line-5)] rounded-xl hover:border-[#29D8D5]/60 transition-all duration-200 cursor-pointer bg-[var(--ohnix-line-1)] hover:bg-[var(--ohnix-hover-overlay)] p-4 min-h-[120px] flex flex-col items-center justify-center">
                                        <UploadOutlined className="text-3xl text-[#29D8D5] mb-3 block" />
                                        <div className="text-[var(--ohnix-text-primary)] font-medium mb-1">
                                            {t("suppliers.upload_photo")}
                                        </div>
                                        <div className="text-sm text-[var(--ohnix-text-muted)]">
                                            JPG, PNG hasta 2MB
                                        </div>
                                    </div>
                                )}
                            </Upload>
                        </Form.Item>
                    </Col>
                </Row>

                <Form.Item className="mb-0">
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
                            {editMode ? t("suppliers.update_supplier") : t("suppliers.create_supplier")}
                        </Button>
                    </div>
                </Form.Item>

            </Form>
        </Modal>
    );
};

export default SupplierForm;
