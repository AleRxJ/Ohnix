import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Button, Input, Modal, Segmented, Table, Tag, Tooltip } from "antd";
import { CheckOutlined, CloseOutlined, SafetyCertificateOutlined, UndoOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { formatCurrency } from "../../utils/currency";
import { paymentProviderService } from "../../services/paymentProviderService";
import { useDataInvalidation } from "../../hooks/useDataInvalidation";

const SOURCE_KEYS = {
    bold: "verification.source_bold",
    bank_reconciliation: "verification.source_bank",
    manual: "verification.source_manual",
};

// Nivel 1 of "did the card/transfer money really arrive?": every card or
// transfer the Caja booked by hand waits here until the bank statement line
// is reconciled (automatic) or someone confirms it. Also lists Bold charges
// that were approved but couldn't be booked as-is (real money, needs a person).
export default function PaymentVerificationPanel() {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("finance", "edit");
    const [status, setStatus] = useState("pending");
    const [data, setData] = useState({ payments: [], pending_count: 0, intents_needing_review: [] });
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);
    const [rejecting, setRejecting] = useState(null);
    const [note, setNote] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setData(await paymentProviderService.listVerifications(status));
        } catch {
            // Keeps the last list - the table simply doesn't refresh.
        } finally {
            setLoading(false);
        }
    }, [status]);

    useEffect(() => {
        load();
    }, [load]);
    useDataInvalidation(["order"], load);

    const update = async (payment, nextStatus, nextNote) => {
        setBusyId(payment._id);
        try {
            await paymentProviderService.setVerification(payment._id, { status: nextStatus, note: nextNote });
            toast.success(t(`verification.toast_${nextStatus}`));
            await load();
        } catch (error) {
            toast.error(error.response?.data?.message || t("verification.update_failed"));
        } finally {
            setBusyId(null);
        }
    };

    const columns = [
        { title: t("verification.col_date"), dataIndex: "paid_at", render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm"), width: 140 },
        {
            title: t("verification.col_sale"),
            dataIndex: "invoice_no",
            render: (v, row) => (
                <div>
                    <div className="font-medium">{v}</div>
                    <div className="text-xs text-[var(--ohnix-text-dim)]">{row.customer_name}</div>
                </div>
            ),
        },
        {
            title: t("verification.col_method"),
            dataIndex: "method",
            render: (v, row) => (
                <div>
                    <div>{v || "—"}</div>
                    <div className="text-xs text-[var(--ohnix-text-dim)]">{row.reference || t("verification.no_reference")}</div>
                </div>
            ),
        },
        { title: t("verification.col_account"), dataIndex: ["cash_account", "name"], render: (v) => v || "—" },
        { title: t("verification.col_amount"), dataIndex: "amount", align: "right", render: (v) => <span className="font-semibold tabular-nums">{formatCurrency(v, "COP")}</span> },
        {
            title: t("verification.col_status"),
            dataIndex: "verification_status",
            render: (v, row) => (
                <Tooltip title={row.verification_note}>
                    <Tag color={v === "verified" ? "success" : v === "rejected" ? "error" : "warning"}>{t(`verification.status_${v}`)}</Tag>
                    {row.verification_source && <div className="mt-1 text-xs text-[var(--ohnix-text-dim)]">{t(SOURCE_KEYS[row.verification_source] || "verification.source_manual")}</div>}
                </Tooltip>
            ),
        },
        {
            title: "",
            key: "actions",
            align: "right",
            render: (_, row) =>
                !canEdit ? null : row.verification_status === "pending" ? (
                    <div className="flex justify-end gap-2">
                        <Button size="small" type="primary" icon={<CheckOutlined />} loading={busyId === row._id} onClick={() => update(row, "verified")}>
                            {t("verification.verify")}
                        </Button>
                        <Button size="small" danger icon={<CloseOutlined />} disabled={busyId === row._id} onClick={() => { setRejecting(row); setNote(""); }}>
                            {t("verification.reject")}
                        </Button>
                    </div>
                ) : row.verification_source === "manual" ? (
                    <Button size="small" icon={<UndoOutlined />} loading={busyId === row._id} onClick={() => update(row, "pending")}>
                        {t("verification.undo")}
                    </Button>
                ) : null,
        },
    ];

    return (
        <section className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 sm:p-6">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--ohnix-accent-line)] bg-[var(--ohnix-accent-soft)]">
                        <SafetyCertificateOutlined className="text-xl text-[var(--ohnix-accent-2)]" />
                    </div>
                    <div>
                        <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-[var(--ohnix-text-primary)]">
                            {t("verification.title")}
                            <Badge count={data.pending_count} overflowCount={99} />
                        </h2>
                        <p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("verification.subtitle")}</p>
                    </div>
                </div>
                <Segmented
                    value={status}
                    onChange={setStatus}
                    options={[
                        { value: "pending", label: t("verification.status_pending") },
                        { value: "verified", label: t("verification.status_verified") },
                        { value: "rejected", label: t("verification.status_rejected") },
                    ]}
                />
            </div>

            {data.intents_needing_review.length > 0 && (
                <Alert
                    className="mb-4"
                    type="error"
                    showIcon
                    message={t("verification.review_title", { count: data.intents_needing_review.length })}
                    description={
                        <ul className="m-0 pl-4">
                            {data.intents_needing_review.map((i) => (
                                <li key={i._id}>
                                    <strong>{i.invoice_no}</strong> · {formatCurrency(i.amount, "COP")} · {i.provider_payment_id || "—"} — {i.last_error}
                                </li>
                            ))}
                        </ul>
                    }
                />
            )}

            {status === "pending" && <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("verification.help")} />}

            <Table
                className="module-dark-table"
                size="small"
                rowKey="_id"
                loading={loading}
                dataSource={data.payments}
                columns={columns}
                scroll={{ x: 820 }}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                locale={{ emptyText: t(`verification.empty_${status}`) }}
            />

            <Modal
                open={Boolean(rejecting)}
                title={t("verification.reject_title")}
                onCancel={() => setRejecting(null)}
                okText={t("verification.reject")}
                okButtonProps={{ danger: true, disabled: !note.trim(), loading: busyId === rejecting?._id }}
                onOk={async () => {
                    await update(rejecting, "rejected", note);
                    setRejecting(null);
                }}
            >
                <p className="text-sm text-[var(--ohnix-text-muted)]">{t("verification.reject_help")}</p>
                <Input.TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("verification.reject_placeholder")} maxLength={300} />
            </Modal>
        </section>
    );
}
