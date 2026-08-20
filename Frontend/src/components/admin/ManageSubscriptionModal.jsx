// Frontend/src/components/admin/ManageSubscriptionModal.jsx
//
// Shared "gestionar suscripción" modal - cancel/uncancel/extend a user's
// subscription plus the admin-action audit trail for that user. Extracted
// out of AdminPayments.jsx so AdminSubscriptions.jsx (the customer-centric
// view) can reuse the exact same actions instead of duplicating ~250 lines.
import React, { useEffect, useState } from "react";
import { Modal, Tag, Button, InputNumber, Spin, Empty } from "antd";
import { PlusCircleOutlined, StopOutlined, UndoOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import { subscriptionService } from "../../services/subscriptionService";

export const SUBSCRIPTION_STATUS_STYLES = {
    active: { color: "green", label: "Activa" },
    paused: { color: "gold", label: "Pausada" },
};

export const formatDate = (value) => (value ? new Date(value).toLocaleString("es-CO") : "-");

const AUDIT_ACTION_LABELS = {
    set_plan: "Cambió el plan",
    cancel_subscription: "Canceló la suscripción",
    uncancel_subscription: "Deshizo la cancelación",
    extend_subscription: "Extendió la suscripción",
    reverify_payment: "Reverificó un pago",
    update_upgrade_request: "Actualizó una solicitud",
    close_upgrade_request: "Cerró una solicitud",
};

const formatAuditMetadata = (entry) => {
    const m = entry.metadata || {};
    switch (entry.action) {
        case "set_plan":
            return `${m.fromPlan} → ${m.toPlan}`;
        case "extend_subscription":
            return `+${m.days} día(s) → vence ${formatDate(m.newEndsAt)}`;
        case "reverify_payment":
            return `${m.fromPaymentStatus} → ${m.toPaymentStatus}`;
        case "update_upgrade_request":
        case "close_upgrade_request":
            return `${m.fromStatus} → ${m.toStatus}`;
        default:
            return "";
    }
};

// target: { userId, email, username, company } | null (null = closed)
const ManageSubscriptionModal = ({ target, onClose, onChanged }) => {
    const [loading, setLoading] = useState(false);
    const [subscription, setSubscription] = useState(null);
    const [auditLog, setAuditLog] = useState([]);
    const [actionLoading, setActionLoading] = useState("");
    const [extendDays, setExtendDays] = useState(30);

    const load = async (userId) => {
        try {
            setLoading(true);
            const [subResponse, auditResponse] = await Promise.all([
                subscriptionService.getUserSubscriptionAdmin(userId),
                subscriptionService.getUserAuditLogAdmin(userId).catch(() => null),
            ]);
            setSubscription(subResponse?.data?.subscription || null);
            setAuditLog(auditResponse?.data?.entries || []);
        } catch (error) {
            toast.error(error.response?.data?.message || "Error");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!target?.userId) return;
        setExtendDays(30);
        load(target.userId);
    }, [target?.userId]);

    const runAction = async (action, actionFn) => {
        try {
            setActionLoading(action);
            const response = await actionFn();
            setSubscription(response?.data || null);
            toast.success(response?.message || "Listo.");
            const auditResponse = await subscriptionService.getUserAuditLogAdmin(target.userId).catch(() => null);
            setAuditLog(auditResponse?.data?.entries || []);
            onChanged?.();
        } catch (error) {
            toast.error(error.response?.data?.message || "Error");
        } finally {
            setActionLoading("");
        }
    };

    return (
        <Modal
            title={
                <div>
                    <div className="text-base font-semibold text-[var(--ohnix-text-primary)]">
                        Gestionar suscripción
                    </div>
                    <div className="text-xs font-normal text-[var(--ohnix-text-muted)]">
                        {target?.username || target?.email}
                        {target?.company?.name ? ` · ${target.company.name}` : ""}
                    </div>
                </div>
            }
            open={Boolean(target)}
            onCancel={onClose}
            footer={null}
            destroyOnClose
        >
            {loading ? (
                <div className="flex justify-center py-8">
                    <Spin />
                </div>
            ) : subscription ? (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                        <div className="flex items-center gap-2">
                            <Tag color={SUBSCRIPTION_STATUS_STYLES[subscription.status]?.color || "default"}>
                                {subscription.plan}
                            </Tag>
                            <Tag color={SUBSCRIPTION_STATUS_STYLES[subscription.status]?.color || "default"}>
                                {SUBSCRIPTION_STATUS_STYLES[subscription.status]?.label || subscription.status}
                            </Tag>
                            {subscription.cancelAtPeriodEnd && <Tag color="volcano">No renueva</Tag>}
                        </div>
                        <div className="mt-2 text-xs text-[var(--ohnix-text-muted)]">
                            Vence: {subscription.endsAt ? formatDate(subscription.endsAt) : "Sin vencimiento"}
                        </div>
                        {subscription.trialEndsAt && (
                            <div className="text-xs text-[var(--ohnix-text-muted)]">
                                Prueba gratuita hasta: {formatDate(subscription.trialEndsAt)}
                            </div>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {subscription.cancelAtPeriodEnd ? (
                            <Button
                                icon={<UndoOutlined />}
                                loading={actionLoading === "uncancel"}
                                onClick={() =>
                                    runAction("uncancel", () =>
                                        subscriptionService.uncancelUserSubscriptionAdmin(target.userId)
                                    )
                                }
                            >
                                Deshacer cancelación
                            </Button>
                        ) : (
                            <Button
                                danger
                                icon={<StopOutlined />}
                                disabled={!subscription.endsAt}
                                loading={actionLoading === "cancel"}
                                onClick={() =>
                                    runAction("cancel", () =>
                                        subscriptionService.cancelUserSubscriptionAdmin(target.userId)
                                    )
                                }
                            >
                                Cancelar (no renueva)
                            </Button>
                        )}
                    </div>

                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ohnix-text-muted)]">
                            Extender suscripción
                        </div>
                        <div className="flex items-center gap-2">
                            <InputNumber min={1} max={365} value={extendDays} onChange={setExtendDays} />
                            <span className="text-xs text-[var(--ohnix-text-muted)]">días</span>
                            <Button
                                type="primary"
                                icon={<PlusCircleOutlined />}
                                loading={actionLoading === "extend"}
                                disabled={!extendDays || extendDays < 1}
                                onClick={() =>
                                    runAction("extend", () =>
                                        subscriptionService.extendUserSubscriptionAdmin(target.userId, extendDays)
                                    )
                                }
                            >
                                Extender
                            </Button>
                        </div>
                        <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">
                            Extiende desde la fecha de vencimiento actual (o desde hoy si ya venció), mantiene el mismo plan y deshace una cancelación pendiente.
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ohnix-text-muted)]">
                            Historial de acciones de admin
                        </div>
                        {auditLog.length === 0 ? (
                            <p className="text-xs text-[var(--ohnix-text-muted)]">
                                Sin acciones de administrador registradas para este usuario.
                            </p>
                        ) : (
                            <div className="max-h-52 space-y-2 overflow-y-auto">
                                {auditLog.map((entry) => (
                                    <div
                                        key={entry.id}
                                        className="rounded-lg border border-[var(--ohnix-line-3)] px-3 py-2 text-xs"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-medium text-[var(--ohnix-text-primary)]">
                                                {AUDIT_ACTION_LABELS[entry.action] || entry.action}
                                            </span>
                                            <span className="text-[var(--ohnix-text-muted)]">
                                                {formatDate(entry.createdAt)}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 text-[var(--ohnix-text-muted)]">
                                            {entry.admin?.username || entry.admin?.email || "admin"}
                                            {formatAuditMetadata(entry) ? ` · ${formatAuditMetadata(entry)}` : ""}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <Empty description="No se pudo cargar la suscripción." />
            )}
        </Modal>
    );
};

export default ManageSubscriptionModal;
