// Frontend/src/components/admin/ManageSubscriptionModal.jsx
//
// Shared "gestionar suscripción" modal - the single per-user admin view:
// current subscription (cancel/uncancel/extend), payment history scoped to
// just this person (with a "Reverificar" action per stuck payment), and the
// admin-action audit trail. Used to be two separate pages (a payments
// ledger and a subscriptions list) - merged into one because filtering a
// global ledger down to "just this person's payments" is exactly what this
// modal already needed to do anyway, so there was no reason to keep a
// second top-level page around for it.
import React, { useEffect, useState } from "react";
import { Modal, Tag, Button, InputNumber, Select, Spin, Empty, Tooltip } from "antd";
import { PlusCircleOutlined, MinusCircleOutlined, StopOutlined, UndoOutlined, SyncOutlined, CopyOutlined, SwapOutlined, ExclamationCircleOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import { subscriptionService } from "../../services/subscriptionService";

export const SUBSCRIPTION_STATUS_STYLES = {
    active: { color: "green", label: "Activa" },
    paused: { color: "gold", label: "Pausada" },
};

// Exported so AdminSubscriptions.jsx's plan filter/column renders the same
// labels this modal's plan-change select uses, instead of a second copy
// that can drift.
export const PLAN_STYLES = {
    starter: { color: "default", label: "Emprendedor" },
    growth: { color: "cyan", label: "Negocio" },
    scale: { color: "purple", label: "Escala" },
    enterprise: { color: "gold", label: "Enterprise" },
};
const PLAN_OPTIONS = Object.keys(PLAN_STYLES);

export const formatDate = (value) => (value ? new Date(value).toLocaleString("es-CO") : "-");

// Exported so the general payments ledger tab in AdminSubscriptions.jsx can
// render the exact same status/mode tags as this modal's per-user history,
// instead of redefining them and drifting out of sync.
export const PAYMENT_STATUS_STYLES = {
    pending: { color: "gold", label: "Pendiente" },
    paid: { color: "green", label: "Pagado" },
    rejected: { color: "red", label: "Rechazado" },
    failed: { color: "red", label: "Fallido" },
    expired: { color: "default", label: "Expirado" },
    cancelled: { color: "default", label: "Cancelado" },
    amount_mismatch: { color: "volcano", label: "Monto no coincide" },
};

export const TEST_MODE_STYLES = {
    true: { color: "purple", label: "Prueba" },
    false: { color: "green", label: "Real" },
    unknown: { color: "default", label: "Sin registrar" },
};

const AUDIT_ACTION_LABELS = {
    set_plan: "Cambió el plan",
    cancel_subscription: "Canceló la suscripción",
    uncancel_subscription: "Deshizo la cancelación",
    extend_subscription: "Extendió la suscripción",
    shorten_subscription: "Recortó la suscripción",
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
        case "shorten_subscription":
            return `-${m.days} día(s) → vence ${formatDate(m.newEndsAt)}`;
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
    const [payments, setPayments] = useState([]);
    const [actionLoading, setActionLoading] = useState("");
    const [reverifyingId, setReverifyingId] = useState("");
    const [extendDays, setExtendDays] = useState(30);
    const [shortenDays, setShortenDays] = useState(30);
    const [planDraft, setPlanDraft] = useState(null);

    const loadPayments = async (userId) => {
        const response = await subscriptionService
            .getAdminPayments({ userId, pageSize: 20 })
            .catch(() => null);
        setPayments(response?.data?.requests || []);
    };

    const load = async (userId) => {
        try {
            setLoading(true);
            const [subResponse, auditResponse] = await Promise.all([
                subscriptionService.getUserSubscriptionAdmin(userId),
                subscriptionService.getUserAuditLogAdmin(userId).catch(() => null),
                loadPayments(userId),
            ]);
            const loadedSubscription = subResponse?.data?.subscription || null;
            setSubscription(loadedSubscription);
            setPlanDraft(loadedSubscription?.plan || null);
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
        setShortenDays(30);
        load(target.userId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [target?.userId]);

    const handleChangePlan = async () => {
        if (!planDraft || planDraft === subscription?.plan) return;
        try {
            setActionLoading("set_plan");
            const response = await subscriptionService.setUserPlanAdmin(target.userId, planDraft);
            toast.success(response?.message || "Plan actualizado.");
            // The endpoint's response omits trialEndsAt/cancelAtPeriodEnd (it
            // only touches plan/status/endsAt) - refetch instead of merging
            // the partial response, so those fields don't silently vanish
            // from the UI after a plan change.
            await load(target.userId);
            onChanged?.();
        } catch (error) {
            toast.error(error.response?.data?.message || "Error");
        } finally {
            setActionLoading("");
        }
    };

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

    const handleReverify = async (payment) => {
        try {
            setReverifyingId(payment.id);
            const response = await subscriptionService.reverifyAdminPayment(payment.id);
            const result = response?.data;
            toast.success(
                result?.changed
                    ? `Estado actualizado: ${PAYMENT_STATUS_STYLES[result.paymentStatus]?.label || result.paymentStatus}`
                    : "El proveedor no reportó ningún cambio todavía."
            );
            await loadPayments(target.userId);
            onChanged?.();
        } catch (error) {
            toast.error(error.response?.data?.message || "Error");
        } finally {
            setReverifyingId("");
        }
    };

    const copyReference = (value) => {
        if (!value) return;
        navigator.clipboard?.writeText(value).then(() => toast.success("Referencia copiada"), () => {});
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
            width={640}
        >
            {loading ? (
                <div className="flex justify-center py-8">
                    <Spin />
                </div>
            ) : subscription ? (
                <div className="space-y-4">
                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                        <div className="flex items-center gap-2">
                            <Tag color={PLAN_STYLES[subscription.plan]?.color || "default"}>
                                {PLAN_STYLES[subscription.plan]?.label || subscription.plan}
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
                            Cambiar plan
                        </div>
                        <div className="flex items-center gap-2">
                            <Select
                                value={planDraft}
                                onChange={setPlanDraft}
                                className="min-w-[180px]"
                                options={PLAN_OPTIONS.map((key) => ({ value: key, label: PLAN_STYLES[key].label }))}
                            />
                            <Button
                                type="primary"
                                icon={<SwapOutlined />}
                                loading={actionLoading === "set_plan"}
                                disabled={!planDraft || planDraft === subscription.plan}
                                onClick={handleChangePlan}
                            >
                                Cambiar plan
                            </Button>
                        </div>
                        <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">
                            Cambio inmediato y sin cobro (sube o baja el plan directamente) - no pasa por checkout. Si el usuario es dueño de un equipo, se rechaza si el equipo tiene más miembros activos que el cupo del plan nuevo.
                        </div>
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
                            Recortar suscripción
                        </div>
                        <div className="flex items-center gap-2">
                            <InputNumber min={1} max={365} value={shortenDays} onChange={setShortenDays} />
                            <span className="text-xs text-[var(--ohnix-text-muted)]">días</span>
                            <Button
                                danger
                                icon={<MinusCircleOutlined />}
                                loading={actionLoading === "shorten"}
                                disabled={!shortenDays || shortenDays < 1 || !subscription.endsAt}
                                onClick={() => {
                                    Modal.confirm({
                                        title: "¿Recortar esta suscripción?",
                                        icon: <ExclamationCircleOutlined />,
                                        content: `Se adelantará el vencimiento ${shortenDays} día(s). Si la nueva fecha ya pasó, el acceso del usuario quedará bloqueado en el próximo ciclo automático (no hay prorrateo ni reembolso en el sistema).`,
                                        okText: "Sí, recortar",
                                        okButtonProps: { danger: true },
                                        cancelText: "Cancelar",
                                        onOk: () =>
                                            runAction("shorten", () =>
                                                subscriptionService.shortenUserSubscriptionAdmin(target.userId, shortenDays)
                                            ),
                                    });
                                }}
                            >
                                Recortar
                            </Button>
                        </div>
                        <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">
                            Adelanta la fecha de vencimiento actual (sin pasar de la fecha en que inició la suscripción). No aplica prorrateo ni reembolso: si el usuario ya pagó ese periodo, valida la situación con el equipo antes de confirmar.
                        </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ohnix-text-muted)]">
                            Historial de pagos
                        </div>
                        {payments.length === 0 ? (
                            <p className="text-xs text-[var(--ohnix-text-muted)]">
                                Este usuario todavía no tiene intentos de pago registrados.
                            </p>
                        ) : (
                            <div className="max-h-64 space-y-2 overflow-y-auto ohnix-scrollbar-thin">
                                {payments.map((payment) => {
                                    const canReverify = payment.status === "approved" && payment.paymentStatus === "pending";
                                    const modeKey =
                                        payment.isTestPayment === null || payment.isTestPayment === undefined
                                            ? "unknown"
                                            : String(payment.isTestPayment);
                                    return (
                                        <div
                                            key={payment.id}
                                            className="rounded-lg border border-[var(--ohnix-line-3)] px-3 py-2 text-xs"
                                        >
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <span className="font-medium text-[var(--ohnix-text-primary)]">
                                                        {payment.currentPlan} → {payment.targetPlan}
                                                    </span>
                                                    {payment.paymentStatus && (
                                                        <Tag color={PAYMENT_STATUS_STYLES[payment.paymentStatus]?.color || "default"}>
                                                            {PAYMENT_STATUS_STYLES[payment.paymentStatus]?.label || payment.paymentStatus}
                                                        </Tag>
                                                    )}
                                                    <Tag color={TEST_MODE_STYLES[modeKey].color}>{TEST_MODE_STYLES[modeKey].label}</Tag>
                                                </div>
                                                {canReverify && (
                                                    <Button
                                                        size="small"
                                                        icon={<SyncOutlined spin={reverifyingId === payment.id} />}
                                                        loading={reverifyingId === payment.id}
                                                        onClick={() => handleReverify(payment)}
                                                        className="rounded-lg border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0]"
                                                    >
                                                        Reverificar
                                                    </Button>
                                                )}
                                            </div>
                                            <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-[var(--ohnix-text-muted)]">
                                                <span>
                                                    {payment.paymentProvider ? payment.paymentProvider.toUpperCase() : "-"}
                                                    {payment.paymentSessionId && (
                                                        <Tooltip title={payment.paymentSessionId}>
                                                            <button
                                                                type="button"
                                                                onClick={() => copyReference(payment.paymentSessionId)}
                                                                className="ml-2 inline-flex items-center gap-1 text-[#29D8D5] hover:text-[#44F3F0]"
                                                            >
                                                                <span className="max-w-[90px] truncate">{payment.paymentSessionId}</span>
                                                                <CopyOutlined />
                                                            </button>
                                                        </Tooltip>
                                                    )}
                                                </span>
                                                <span>{formatDate(payment.createdAt)}</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
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
                            <div className="max-h-52 space-y-2 overflow-y-auto ohnix-scrollbar-thin">
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
