import React, { useContext } from "react";
import {
    Form,
    Input,
    Select,
    Upload,
    Row,
    Col,
    Button,
    Card,
} from "antd";
import {
    UploadOutlined,
    UserOutlined,
    MailOutlined,
    PhoneOutlined,
    ShopOutlined,
    BankOutlined,
    IdcardOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useInventoryTour } from "../../context/InventoryTourContext";
import PhotoDropZone from "../common/PhotoDropZone";
import { ELECTRONIC_INVOICING_ENABLED } from "../../config/features";

const { Option } = Select;
const { TextArea } = Input;

const sectionCardProps = {
    className: "shadow-sm border-0 module-shell h-full",
    headStyle: {
        borderBottom: "1px solid var(--ohnix-line-3)",
        background: "transparent",
    },
};

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
    const { user } = useContext(AuthContext);
    const { isOpen: isTutorialActive, effectiveSteps, stepIndex } = useInventoryTour();
    const isTourCreateStep =
        isTutorialActive && !editingCustomer && effectiveSteps[stepIndex]?.id === "create-customer";
    const usesColombianEInvoicing =
        ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && user?.company?.electronicInvoicingEnabled;
    const uploadProps = {
        fileList,
        // showUploadList is false so our own PhotoDropZone renders the
        // preview - antd only auto-generates thumbUrl inside its own list
        // renderer, which never mounts in that mode, so a freshly picked
        // file needs its data-URL preview built here instead.
        onChange: ({ fileList: newFileList }) => {
            setFileList(newFileList);
            const latest = newFileList[newFileList.length - 1];
            if (latest?.originFileObj && !latest.thumbUrl && !latest.url) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    setFileList((prev) =>
                        prev.map((f) =>
                            f.uid === latest.uid ? { ...f, thumbUrl: e.target.result } : f
                        )
                    );
                };
                reader.readAsDataURL(latest.originFileObj);
            }
        },
        beforeUpload: () => false,
        maxCount: 1,
        accept: "image/*",
        listType: "picture",
        showUploadList: false,
    };

    return (
        <div className="min-h-full">
            <Form
                form={form}
                layout="vertical"
                onFinish={onSubmit}
                scrollToFirstError
                className="space-y-5"
            >
                {/* Two cards side by side instead of four stacked full-width
                    blocks - a wide modal was mostly wasted whitespace on the
                    right half before, forcing a lot of scrolling for what's
                    really a short form. */}
                <Row gutter={[20, 20]}>
                    <Col xs={24} md={12}>
                        <Card
                            {...sectionCardProps}
                            title={
                                <div className="flex items-center text-[var(--ohnix-text-primary)]">
                                    <UserOutlined className="mr-3 text-[#29D8D5] text-lg" />
                                    <span className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                                        {t("customers.personal_information")}
                                    </span>
                                </div>
                            }
                        >
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
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
                                extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                            >
                                <Input
                                    placeholder={t("customers.enter_full_name")}
                                    size="large"
                                    prefix={
                                        <UserOutlined className="text-[var(--ohnix-text-dim)]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                    disabled={isTourCreateStep}
                                />
                            </Form.Item>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
                                        {t("customers.customer_type")}
                                    </span>
                                }
                                name="type"
                                initialValue="regular"
                                className="mb-0"
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
                        </Card>
                    </Col>

                    <Col xs={24} md={12}>
                        <Card
                            {...sectionCardProps}
                            title={
                                <div className="flex items-center text-[var(--ohnix-text-primary)]">
                                    <MailOutlined className="mr-3 text-[#44F3F0] text-lg" />
                                    <span className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                                        {t("customers.contact_information")}
                                    </span>
                                </div>
                            }
                        >
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
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
                                        <MailOutlined className="text-[var(--ohnix-text-dim)]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                    disabled={isTourCreateStep}
                                />
                            </Form.Item>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
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
                                        <PhoneOutlined className="text-[var(--ohnix-text-dim)]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                    disabled={isTourCreateStep}
                                />
                            </Form.Item>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
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
                                className="mb-0"
                            >
                                <TextArea
                                    placeholder={t("customers.address_placeholder")}
                                    rows={2}
                                    size="large"
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Card>
                    </Col>
                </Row>

                <Row gutter={[20, 20]}>
                    <Col xs={24} md={12}>
                        <Card
                            {...sectionCardProps}
                            title={
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center text-[var(--ohnix-text-primary)]">
                                        <ShopOutlined className="mr-3 text-[#29D8D5] text-lg" />
                                        <span className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                                            {t("customers.business_information")}
                                        </span>
                                    </div>
                                    <span className="text-xs font-normal text-[var(--ohnix-text-muted)] bg-[var(--ohnix-line-1)] px-3 py-1 rounded-full border border-[var(--ohnix-line-3)]">
                                        {t("customers.optional")}
                                    </span>
                                </div>
                            }
                        >
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
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
                                        <ShopOutlined className="text-[var(--ohnix-text-dim)]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
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
                                        <IdcardOutlined className="text-[var(--ohnix-text-dim)]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                            <Form.Item
                                label={
                                    <span className="font-medium text-[var(--ohnix-text-muted)]">
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
                                className="mb-0"
                            >
                                <Input
                                    placeholder={t("customers.account_number_placeholder")}
                                    size="large"
                                    prefix={
                                        <BankOutlined className="text-[var(--ohnix-text-dim)]" />
                                    }
                                    className="rounded-lg auth-ohnix-input"
                                />
                            </Form.Item>
                        </Card>
                    </Col>

                    <Col xs={24} md={12}>
                        <Card
                            {...sectionCardProps}
                            title={
                                <div className="flex items-center text-[var(--ohnix-text-primary)]">
                                    <UploadOutlined className="mr-3 text-[#44F3F0] text-lg" />
                                    <span className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                                        {t("customers.customer_photo")}
                                    </span>
                                </div>
                            }
                        >
                            <Form.Item className="mb-0">
                                <Upload {...uploadProps}>
                                    <PhotoDropZone
                                        imageUrl={fileList[0]?.thumbUrl || fileList[0]?.url}
                                        title={t("customers.click_to_upload_photo")}
                                        subtitle={t("customers.photo_upload_help")}
                                        height="h-40 sm:h-44"
                                    />
                                </Upload>
                            </Form.Item>
                        </Card>
                    </Col>
                </Row>

                {usesColombianEInvoicing && (
                    <Card
                        title={
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex items-center text-[var(--ohnix-text-primary)]">
                                    <IdcardOutlined className="mr-3 text-[#44F3F0] text-lg" />
                                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">{t("customers.dian_data")}</span>
                                </div>
                                <span className="text-xs text-[#44F3F0] bg-[#29D8D5]/10 px-3 py-1 rounded-full border border-[#29D8D5]/20">
                                    {t("customers.dian_badge")}
                                </span>
                            </div>
                        }
                        className="shadow-sm border-0 module-shell"
                        headStyle={{ borderBottom: "1px solid var(--ohnix-line-3)", background: "transparent" }}
                    >
                        <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">
                            {t("customers.dian_hint")}
                        </p>
                        <Row gutter={[24, 16]}>
                            <Col xs={24} sm={8}>
                                <Form.Item name="identification_document_code" label={t("customers.dian_document_type")} rules={[{ required: true, message: t("customers.dian_document_type_required") }]}>
                                    <Select size="large" className="auth-ohnix-input" options={[{ value: "13", label: t("customers.dian_doc_cc") }, { value: "31", label: t("customers.dian_doc_nit") }, { value: "22", label: t("customers.dian_doc_ce") }, { value: "41", label: t("customers.dian_doc_passport") }]} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={8}>
                                <Form.Item name="identification" label={t("customers.dian_identification")} rules={[{ required: true, message: t("customers.dian_identification_required") }]}>
                                    <Input size="large" className="auth-ohnix-input" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={8}>
                                <Form.Item name="municipality_code" label={t("customers.dian_municipality_code")} rules={[{ required: true, message: t("customers.dian_municipality_code_required") }]}>
                                    <Input size="large" placeholder={t("customers.dian_municipality_code_placeholder")} className="auth-ohnix-input" />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="legal_organization_code" label={t("customers.dian_organization")} rules={[{ required: true, message: t("customers.dian_organization_required") }]}>
                                    <Select size="large" className="auth-ohnix-input" options={[{ value: "1", label: t("customers.dian_org_legal") }, { value: "2", label: t("customers.dian_org_natural") }]} />
                                </Form.Item>
                            </Col>
                            <Col xs={24} sm={12}>
                                <Form.Item name="tribute_code" label={t("customers.dian_tax_liability")} rules={[{ required: true, message: t("customers.dian_tax_liability_required") }]}>
                                    <Select size="large" className="auth-ohnix-input" options={[{ value: "ZZ", label: t("customers.dian_tax_not_liable") }, { value: "01", label: t("customers.dian_tax_vat") }]} />
                                </Form.Item>
                            </Col>
                        </Row>
                    </Card>
                )}

                {/* Form Actions */}
                <div className="flex justify-end pt-6 border-t border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] -mx-6 px-6 py-4 space-x-3">
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

        </div>
    );
};

export default CustomerForm;
