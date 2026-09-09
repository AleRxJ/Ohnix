import { Alert, Modal, Form, Input, Select } from "antd";
import { WalletOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;

const modalStyles = {
    mask: { backgroundColor: "var(--ohnix-modal-mask)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid var(--ohnix-accent-line)",
        boxShadow: "var(--ohnix-shadow-elevated)",
        borderRadius: "28px",
    },
    header: { background: "transparent", borderBottom: "none", padding: "28px 28px 0" },
    body: { padding: "16px 28px 28px" },
    footer: { padding: "0 28px 24px" },
};

// Dual-mode create/edit modal - same shape as PointsOfSaleTab.jsx's modal.
// `mode` and `form` are owned by the parent (Finance.jsx).
const CashAccountFormModal = ({ open, mode, form, pointsOfSale, chartAccounts, submitting, onCancel, onSubmit }) => {
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
                className: "h-10 px-6 rounded-md bg-[var(--ohnix-accent)] border-0 text-[var(--ohnix-accent-contrast)] font-medium transition-all duration-200",
            }}
            cancelButtonProps={{
                className: "h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[var(--ohnix-accent-2)] hover:border-[var(--ohnix-accent-line-strong)] transition-colors duration-200",
            }}
            destroyOnClose
            styles={modalStyles}
        >
            <div className="mb-6 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)] shadow-[var(--ohnix-accent-glow)]">
                    <WalletOutlined className="text-2xl text-[var(--ohnix-accent-2)]" />
                </div>
                <h3 className="m-0 text-xl font-bold text-[var(--ohnix-text-primary)]">
                    {mode === "create" ? t("finance.create_modal_title") : t("finance.edit_modal_title")}
                </h3>
            </div>

            <Form form={form} layout="vertical" onFinish={onSubmit}>
                <Alert className="dark-alert dark-alert-teal mb-5" type="info" showIcon message={t("finance.chart_account_help_title")} description={t("finance.chart_account_help_desc")} />
                <Form.Item
                    name="name"
                    label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("finance.name_label")}</span>}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <Input size="large" className="auth-ohnix-input" placeholder={t("finance.name_placeholder")} maxLength={80} />
                </Form.Item>

                <Form.Item
                    name="chart_account_id"
                    label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("finance.chart_account_label")}</span>}
                    extra={mode === "edit" ? t("finance.chart_account_edit_help") : t("finance.chart_account_default_help")}
                >
                    <Select size="large" allowClear showSearch optionFilterProp="label" placeholder={t("finance.chart_account_placeholder")} options={chartAccounts.map((account) => ({ value: account._id, label: `${account.code} · ${account.name}` }))} />
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
