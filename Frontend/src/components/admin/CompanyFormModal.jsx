import React from "react";
import { Modal, Form, Input, Select, Switch, Upload, Button, ColorPicker, DatePicker, Tag, Divider } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
        borderRadius: "24px",
    },
    header: {
        background: "transparent",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
        padding: "20px 24px 16px",
    },
    body: { padding: 24 },
};

const ResolutionFields = ({ basePath, t }) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Form.Item name={[...basePath, "resolutionNumber"]} label={t("admin.alanube_resolution_number")}>
            <Input size="large" className="auth-ohnix-input" />
        </Form.Item>
        <Form.Item name={[...basePath, "prefix"]} label={t("admin.alanube_resolution_prefix")}>
            <Input size="large" className="auth-ohnix-input" />
        </Form.Item>
        <Form.Item name={[...basePath, "minNumber"]} label={t("admin.alanube_resolution_min")}>
            <Input size="large" type="number" className="auth-ohnix-input" />
        </Form.Item>
        <Form.Item name={[...basePath, "maxNumber"]} label={t("admin.alanube_resolution_max")}>
            <Input size="large" type="number" className="auth-ohnix-input" />
        </Form.Item>
        <Form.Item
            name={[...basePath, "startDate"]}
            label={t("admin.alanube_resolution_start")}
            getValueProps={(value) => ({ value: value ? dayjs(value) : undefined })}
            normalize={(value) => (value ? value.format("YYYY-MM-DD") : null)}
        >
            <DatePicker size="large" className="auth-ohnix-input w-full" />
        </Form.Item>
        <Form.Item
            name={[...basePath, "endDate"]}
            label={t("admin.alanube_resolution_end")}
            getValueProps={(value) => ({ value: value ? dayjs(value) : undefined })}
            normalize={(value) => (value ? value.format("YYYY-MM-DD") : null)}
        >
            <DatePicker size="large" className="auth-ohnix-input w-full" />
        </Form.Item>
        <Form.Item name={[...basePath, "technicalKey"]} label={t("admin.alanube_resolution_technical_key")} className="sm:col-span-2">
            <Input size="large" className="auth-ohnix-input" />
        </Form.Item>
    </div>
);

const CompanyFormModal = ({ open, onCancel, onSubmit, submitting, form, editingCompany, onUploadLogo, onRegisterAlanube }) => {
    const { t } = useI18n();
    const selectedCountry = Form.useWatch("countryCode", form);
    const selectedProvider = Form.useWatch("electronicInvoicingProvider", form) || "alanube";

    return (
        <Modal
            title={
                <span className="text-lg font-bold text-white">
                    {editingCompany ? t("admin.configure_company") : t("admin.add_company")}
                </span>
            }
            open={open}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            destroyOnClose
            width={640}
            styles={darkModalStyles}
        >
            <Form form={form} layout="vertical" onFinish={onSubmit} className="mt-2">
                <Form.Item
                    name="name"
                    label={t("admin.company_name")}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item name="legalName" label={t("admin.company_legal_name")}>
                    <Input size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item
                    name="countryCode"
                    label={t("admin.country_iso_label")}
                    initialValue="CO"
                    rules={[
                        {
                            pattern: /^[A-Za-z]{2}$/,
                            message: t("admin.country_iso_hint"),
                        },
                    ]}
                >
                    <Select
                        size="large"
                        className="auth-ohnix-input"
                        showSearch
                        options={[
                            { value: "CO", label: "CO - Colombia" },
                            { value: "ES", label: "ES - España" },
                        ]}
                        filterOption={(input, option) =>
                            `${option?.label || ""}`.toLowerCase().includes(input.toLowerCase())
                        }
                    />
                </Form.Item>
                <Form.Item name="contactEmail" label={t("admin.company_contact_email")}>
                    <Input type="email" size="large" className="auth-ohnix-input" />
                </Form.Item>
                <Form.Item name="phone" label={t("admin.company_phone")}>
                    <Input size="large" className="auth-ohnix-input" />
                </Form.Item>

                <div className="module-shell rounded-2xl border border-white/10 p-4 mb-4">
                    <div className="mb-3 text-sm font-bold text-white">{t("admin.pdf_branding_title")}</div>
                    <p className="mb-3 text-xs text-[#8B98A0]">{t("admin.pdf_branding_hint")}</p>

                    {editingCompany ? (
                        <div className="mb-4 flex items-center gap-3">
                            {editingCompany.logoUrl && (
                                <img
                                    src={editingCompany.logoUrl}
                                    alt="logo"
                                    className="h-12 w-12 rounded-lg border border-white/10 bg-white/5 object-contain"
                                />
                            )}
                            <Upload
                                accept="image/*"
                                showUploadList={false}
                                beforeUpload={() => false}
                                onChange={({ file }) => onUploadLogo?.(editingCompany.id, file)}
                            >
                                <Button icon={<UploadOutlined />}>{t("admin.upload_logo")}</Button>
                            </Upload>
                        </div>
                    ) : (
                        <p className="mb-4 text-xs text-[#8B98A0]">{t("admin.upload_logo_after_create")}</p>
                    )}

                    <Form.Item
                        name="pdfFooterText"
                        label={t("admin.pdf_footer_text")}
                        extra={<span className="text-[#8B98A0]">{t("admin.pdf_footer_text_hint")}</span>}
                    >
                        <Input.TextArea rows={2} className="auth-ohnix-input" placeholder={t("admin.pdf_footer_text_placeholder")} />
                    </Form.Item>

                    <Form.Item
                        name="pdfAccentColor"
                        label={t("admin.pdf_accent_color")}
                        extra={<span className="text-[#8B98A0]">{t("admin.pdf_accent_color_hint")}</span>}
                        getValueFromEvent={(_, hex) => hex}
                        className="mb-0"
                    >
                        <ColorPicker format="hex" showText />
                    </Form.Item>
                </div>

                {selectedCountry === "CO" && (
                    <div className="relative overflow-hidden rounded-2xl border border-[#29D8D5]/25 bg-[radial-gradient(circle_at_90%_10%,rgba(41,216,213,.20),transparent_35%),linear-gradient(135deg,rgba(16,39,43,.9),rgba(14,12,31,.88))] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,.07)]">
                        <div className="absolute right-[-22px] top-[-25px] h-24 w-24 rounded-full border border-[#44F3F0]/20" />
                        <div className="relative mb-1 flex items-center gap-2 text-sm font-bold text-white">
                            <span className="h-2 w-2 rounded-full bg-[#44F3F0] shadow-[0_0_14px_#44F3F0]" />
                            {t("admin.dian_section_title")}
                        </div>
                        <p className="relative mb-4 text-xs text-[#A9B3B8]">{t("admin.dian_section_hint")}</p>
                        <Form.Item name="electronicInvoicingEnabled" valuePropName="checked" initialValue={false}>
                            <Switch checkedChildren={t("admin.dian_toggle_active")} unCheckedChildren={t("admin.dian_toggle_inactive")} />
                        </Form.Item>

                        <Form.Item name="electronicInvoicingProvider" label={t("admin.dian_provider")} initialValue="alanube">
                            <Select
                                size="large"
                                options={[
                                    { value: "alanube", label: "Alanube" },
                                    { value: "factus", label: "Factus" },
                                ]}
                            />
                        </Form.Item>

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <Form.Item name="factusPaymentForm" label={t("admin.dian_payment_form")} initialValue="1">
                                <Select
                                    size="large"
                                    options={[
                                        { value: "1", label: t("admin.dian_payment_cash") },
                                        { value: "2", label: t("admin.dian_payment_credit") },
                                    ]}
                                />
                            </Form.Item>
                            <Form.Item name="factusPaymentMethodCode" label={t("admin.dian_payment_method")} initialValue="42">
                                <Input size="large" className="auth-ohnix-input" placeholder="42" />
                            </Form.Item>
                        </div>

                        {selectedProvider === "factus" ? (
                            <>
                                <Form.Item name="factusNumberingRangeId" label={t("admin.dian_numbering_range_id")}>
                                    <Input size="large" className="auth-ohnix-input" placeholder={t("admin.dian_numbering_range_placeholder")} />
                                </Form.Item>
                                <Form.Item
                                    name="factusCreditNoteNumberingRangeId"
                                    label={t("admin.dian_credit_note_numbering_range_id")}
                                    extra={<span className="text-[#8B98A0]">{t("admin.dian_credit_note_numbering_range_hint")}</span>}
                                >
                                    <Input size="large" className="auth-ohnix-input" placeholder={t("admin.dian_numbering_range_placeholder")} />
                                </Form.Item>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Form.Item name="factusDocumentType" label={t("admin.dian_document_type")} initialValue="01">
                                        <Select size="large" options={[{ value: "01", label: t("admin.dian_doc_invoice") }]} />
                                    </Form.Item>
                                    <Form.Item name="factusOperationType" label={t("admin.dian_operation_type")} initialValue="10">
                                        <Select
                                            size="large"
                                            options={[
                                                { value: "10", label: t("admin.dian_operation_standard") },
                                                { value: "11", label: t("admin.dian_operation_mandate") },
                                            ]}
                                        />
                                    </Form.Item>
                                </div>
                            </>
                        ) : (
                            <>
                                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                    <Form.Item name="taxIdentification" label={t("admin.alanube_nit")}>
                                        <Input size="large" className="auth-ohnix-input" placeholder="900123456" />
                                    </Form.Item>
                                    <Form.Item name="taxIdentificationDv" label={t("admin.alanube_nit_dv")}>
                                        <Input size="large" className="auth-ohnix-input" placeholder={t("admin.alanube_nit_dv_hint")} />
                                    </Form.Item>
                                </div>

                                {editingCompany && (
                                    <div className="mb-4 flex flex-wrap items-center gap-3">
                                        <Tag color={editingCompany.alanubeCompanyId ? "cyan" : "default"}>
                                            {editingCompany.alanubeCompanyId
                                                ? t("admin.alanube_registered_status", { id: editingCompany.alanubeCompanyId })
                                                : t("admin.alanube_not_registered_status")}
                                        </Tag>
                                        <Button size="small" onClick={() => onRegisterAlanube?.(editingCompany.id)}>
                                            {editingCompany.alanubeCompanyId ? t("admin.alanube_reregister") : t("admin.alanube_register")}
                                        </Button>
                                    </div>
                                )}

                                <Form.Item name="alanubeTestSetId" label={t("admin.alanube_test_set_id")} extra={<span className="text-[#8B98A0]">{t("admin.alanube_test_set_id_hint")}</span>}>
                                    <Input size="large" className="auth-ohnix-input" />
                                </Form.Item>

                                <Divider className="!border-white/10 !my-4" orientation="left">
                                    <span className="text-xs text-[#8B98A0]">{t("admin.alanube_invoice_resolution")}</span>
                                </Divider>
                                <ResolutionFields basePath={["alanubeInvoiceResolution"]} t={t} />

                                <Divider className="!border-white/10 !my-4" orientation="left">
                                    <span className="text-xs text-[#8B98A0]">{t("admin.alanube_credit_note_resolution")}</span>
                                </Divider>
                                <ResolutionFields basePath={["alanubeCreditNoteResolution"]} t={t} />
                            </>
                        )}
                    </div>
                )}
            </Form>
        </Modal>
    );
};

export default CompanyFormModal;
