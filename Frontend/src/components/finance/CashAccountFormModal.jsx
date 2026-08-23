import { Modal, Form, Input, Select } from "antd";
import { WalletOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid rgba(41,216,213,0.18)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6), 0 0 40px rgba(41,216,213,0.06)",
        borderRadius: "28px",
    },
    header: { background: "transparent", borderBottom: "none", padding: "28px 28px 0" },
    body: { padding: "16px 28px 28px" },
    footer: { padding: "0 28px 24px" },
};

// Dual-mode create/edit modal - same shape as PointsOfSaleTab.jsx's modal.
// `mode` and `form` are owned by the parent (Finance.jsx).
const CashAccountFormModal = ({ open, mode, form, pointsOfSale, submitting, onCancel, onSubmit }) => {
    const { t } = useI18n();
    const accountType = Form.useWatch("account_type", form);

    return (
        <Modal
            title={null}
            open={open}
            onCancel={onCancel}
            onOk={() => form.submit()}
            confirmLoading={submitting}
            okText={mode === "create" ? t("finance.create_cta") : t("common.save")}
            cancelText={t("common.cancel")}
            okButtonProps={{
                className: "h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200",
            }}
            cancelButtonProps={{
                className: "h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200",
            }}
            destroyOnClose
            styles={darkModalStyles}
        >
            <div className="mb-6 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[linear-gradient(135deg,rgba(41,216,213,0.18),rgba(68,243,240,0.06))] shadow-[0_0_24px_rgba(41,216,213,0.18)]">
                    <WalletOutlined className="text-2xl text-[#44F3F0]" />
                </div>
                <h3 className="m-0 text-xl font-bold text-[var(--ohnix-text-primary)]">
                    {mode === "create" ? t("finance.create_modal_title") : t("finance.edit_modal_title")}
                </h3>
            </div>

            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Form.Item
                    name="name"
                    label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("finance.name_label")}</span>}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input size="large" className="auth-ohnix-input" placeholder={t("finance.name_placeholder")} maxLength={80} />
                </Form.Item>

                <Form.Item
                    name="account_type"
                    label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("finance.account_type_label")}</span>}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Select size="large" disabled={mode === "edit"}>
                        <Option value="cash">{t("finance.account_type_cash")}</Option>
                        <Option value="bank">{t("finance.account_type_bank")}</Option>
                    </Select>
                </Form.Item>

                <Form.Item
                    name="point_of_sale_id"
                    label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("finance.point_of_sale_label")}</span>}
                    extra={accountType === "bank" ? t("finance.point_of_sale_all_locations") : undefined}
                    rules={mode === "create" && accountType === "cash" ? [{ required: true, message: t("finance.point_of_sale_required_hint") }] : []}
                >
                    <Select
                        size="large"
                        allowClear
                        placeholder={accountType === "bank" ? t("finance.point_of_sale_all_locations") : undefined}
                        disabled={mode === "edit"}
                    >
                        {pointsOfSale.map((pos) => (
                            <Option key={pos.id} value={pos.id}>
                                {pos.name}
                            </Option>
                        ))}
                    </Select>
                </Form.Item>

                {accountType === "bank" && (
                    <>
                        <Form.Item
                            name="bank_name"
                            label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("finance.bank_name_label")}</span>}
                        >
                            <Input size="large" className="auth-ohnix-input" placeholder={t("finance.bank_name_placeholder")} maxLength={80} />
                        </Form.Item>
                        <Form.Item
                            name="account_number"
                            label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("finance.account_number_label")}</span>}
                        >
                            <Input size="large" className="auth-ohnix-input" placeholder={t("finance.account_number_placeholder")} maxLength={40} />
                        </Form.Item>
                    </>
                )}
            </Form>
        </Modal>
    );
};

export default CashAccountFormModal;
