import React, { useContext } from "react";
import { Modal, Typography, Button } from "antd";
import {
    ArrowRightOutlined,
    SendOutlined,
    CheckOutlined,
    CarOutlined,
    InboxOutlined,
    CloseOutlined,
    ThunderboltOutlined,
    ExclamationCircleOutlined,
    PrinterOutlined,
} from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { printTransferDocument } from "../../utils/printTransferDocument";

const { Text } = Typography;

// Full audit trail for one transfer - the compact card in LocationStockPanel
// only has room for the abstract request->approve->ship->receive stepper;
// this is where the concrete facts live (who, when, what was typed as the
// reason). Only renders the events that actually happened, in order - a
// transfer still sitting at "requested" only shows one row, not four with
// three greyed out, since there's nothing to say about a step that hasn't
// happened yet.
const TIMELINE_STEPS = [
    { key: "requested", icon: SendOutlined, actorField: "requested_by", atField: "requested_at" },
    { key: "approved", icon: CheckOutlined, actorField: "approved_by", atField: "approved_at" },
    { key: "sent", icon: CarOutlined, actorField: "sent_by", atField: "sent_at" },
    { key: "received", icon: InboxOutlined, actorField: "received_by", atField: "received_at" },
    { key: "cancelled", icon: CloseOutlined, actorField: "cancelled_by", atField: "cancelled_at" },
];

const TransferDetailModal = ({ visible, transfer, product, onCancel }) => {
    const { t, currentLanguage } = useI18n();
    const { user } = useContext(AuthContext);

    if (!transfer) return null;

    const formatDate = (value) =>
        new Date(value).toLocaleString(currentLanguage, {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });

    const events = TIMELINE_STEPS.filter((step) => transfer[step.atField]);

    const handlePrint = () => {
        const companyName = user?.company?.legalName || user?.company?.name || user?.username || "";
        const opened = printTransferDocument({ transfer, product, companyName, t, currentLanguage });
        if (!opened) {
            toast.error(t("printTransfer.popup_blocked"));
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <InboxOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {t("products.transfer_detail_title")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            centered
            width={480}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "20px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "20px 24px 24px", maxHeight: "72vh", overflowY: "auto" },
            }}
        >
            <div className="flex justify-end mb-4">
                <Button
                    size="small"
                    icon={<PrinterOutlined />}
                    onClick={handlePrint}
                    className="h-8 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                >
                    {t("products.print_transfer_cta")}
                </Button>
            </div>

            <div className="mb-5 p-4 rounded-xl bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)]">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span className="px-2 py-0.5 rounded-md bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] text-sm font-medium">
                        {transfer.from_point_of_sale?.name || "—"}
                    </span>
                    <ArrowRightOutlined className="text-[var(--ohnix-text-dim)]" />
                    <span className="px-2 py-0.5 rounded-md bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] text-sm font-medium">
                        {transfer.to_point_of_sale?.name || "—"}
                    </span>
                    {transfer.is_quick_transfer && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] rounded-full px-2 py-0.5 flex items-center gap-1">
                            <ThunderboltOutlined /> {t("products.quick_transfer_badge")}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-4">
                    <div>
                        <Text className="text-[11px] text-[var(--ohnix-text-dim)] block">{t("products.transfer_quantity_sent_label")}</Text>
                        <Text className="text-lg font-bold text-[#44F3F0]">{transfer.quantity_sent}</Text>
                    </div>
                    {transfer.quantity_received != null && (
                        <div>
                            <Text className="text-[11px] text-[var(--ohnix-text-dim)] block">{t("products.transfer_quantity_received_label")}</Text>
                            <Text className="text-lg font-bold text-[var(--ohnix-text-primary)]">{transfer.quantity_received}</Text>
                        </div>
                    )}
                    {transfer.discrepancy > 0 && (
                        <div>
                            <Text className="text-[11px] text-[var(--ohnix-status-rose)] block flex items-center gap-1">
                                <ExclamationCircleOutlined /> {t("products.transfer_discrepancy_label")}
                            </Text>
                            <Text className="text-lg font-bold text-[var(--ohnix-status-rose)]">{transfer.discrepancy}</Text>
                        </div>
                    )}
                </div>
                {transfer.discrepancy > 0 && (
                    <Text className="text-xs text-[var(--ohnix-text-dim)] block mt-2">
                        {t("products.transfer_discrepancy_accounting_hint")}
                    </Text>
                )}
            </div>

            {transfer.notes && (
                <div className="mb-4">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] block mb-1">
                        {t("products.transfer_reason_label")}
                    </Text>
                    <Text className="text-sm text-[var(--ohnix-text-soft)] whitespace-pre-wrap">{transfer.notes}</Text>
                </div>
            )}

            {transfer.status === "cancelled" && transfer.cancel_reason && (
                <div className="mb-4">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ohnix-status-rose)] block mb-1">
                        {t("products.transfer_cancel_reason_label")}
                    </Text>
                    <Text className="text-sm text-[var(--ohnix-text-soft)]">{transfer.cancel_reason}</Text>
                </div>
            )}

            <Text className="text-[11px] font-semibold uppercase tracking-wide text-[var(--ohnix-text-dim)] block mb-3">
                {t("products.transfer_timeline_title")}
            </Text>
            <div className="space-y-3">
                {events.map((step) => {
                    const Icon = step.icon;
                    const actor = transfer[step.actorField];
                    return (
                        <div key={step.key} className="flex items-start gap-3">
                            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)] flex-shrink-0 mt-0.5">
                                <Icon className="text-xs text-[#44F3F0]" />
                            </div>
                            <div className="min-w-0">
                                <Text className="text-sm font-semibold text-[var(--ohnix-text-primary)] block">
                                    {t(`products.transfer_status_${step.key === "sent" ? "in_transit" : step.key}`)}
                                </Text>
                                <Text className="text-xs text-[var(--ohnix-text-muted)]">
                                    {actor?.username
                                        ? t("products.transfer_timeline_by", { name: actor.username })
                                        : t("products.transfer_timeline_unknown_actor")}
                                    {" · "}
                                    {formatDate(transfer[step.atField])}
                                </Text>
                            </div>
                        </div>
                    );
                })}
            </div>
        </Modal>
    );
};

export default TransferDetailModal;
