import React, { useEffect } from "react";
import { Modal, Form, InputNumber, Input, Button, Typography } from "antd";
import { InboxOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { TextArea } = Input;
const { Text } = Typography;

const fieldLabel = (text) => (
    <span className="font-medium text-[var(--ohnix-text-muted)]">{text}</span>
);

// The receiving side states what actually arrived - never assumed to equal
// what was sent (see StockTransfer's model comment on discrepancy). Only
// this amount gets credited to the destination; a shortfall is recorded on
// the transfer, not silently absorbed.
const ReceiveTransferModal = ({ visible, transfer, loading, onSubmit, onCancel }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();

    useEffect(() => {
        if (visible && transfer) {
            form.setFieldsValue({ quantityReceived: transfer.quantity_sent, notes: "" });
        }
    }, [visible, transfer, form]);

    if (!transfer) return null;

    const handleOk = async () => {
        const values = await form.validateFields();
        await onSubmit(transfer._id, { quantityReceived: values.quantityReceived, notes: values.notes?.trim() || undefined });
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <InboxOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {t("products.transfer_receive_modal_title")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={420}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "20px",
                },
                header: { background: "transparent", borderBottom: "1px solid var(--ohnix-line-3)", padding: "20px 24px 16px" },
                body: { padding: "20px 24px 24px" },
            }}
        >
            <div className="mb-5 p-4 rounded-xl bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] flex items-center justify-between">
                <Text className="text-sm text-[var(--ohnix-text-muted)]">{t("products.transfer_quantity_sent_label")}</Text>
                <Text className="text-base font-bold text-[var(--ohnix-text-primary)]">{transfer.quantity_sent}</Text>
            </div>

            <Form form={form} layout="vertical">
                <Form.Item
                    name="quantityReceived"
                    label={fieldLabel(t("products.transfer_quantity_received_label"))}
                    rules={[{ required: true, message: t("orders.enter_quantity_message") }]}
                >
                    <InputNumber min={0} max={transfer.quantity_sent} className="w-full auth-ohnix-input" size="large" />
                </Form.Item>
                <Form.Item name="notes" label={fieldLabel(t("products.transfer_reason_label"))} className="mb-0">
                    <TextArea
                        rows={2}
                        maxLength={280}
                        showCount
                        placeholder={t("products.transfer_receive_notes_placeholder")}
                        className="auth-ohnix-input"
                    />
                </Form.Item>
            </Form>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 mt-5 border-t border-[var(--ohnix-line-4)]">
                <Button
                    onClick={onCancel}
                    disabled={loading}
                    className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                >
                    {t("common.cancel")}
                </Button>
                <Button
                    type="primary"
                    onClick={handleOk}
                    loading={loading}
                    className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                >
                    {t("products.transfer_receive")}
                </Button>
            </div>
        </Modal>
    );
};

export default ReceiveTransferModal;
