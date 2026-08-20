// Frontend/src/pages/AdminPayments.jsx
//
// Dedicated payments ledger for admins - distinct from the "upgrade
// requests I need to review" queue already in Billing.jsx's admin section
// (which defaults to open/reviewing only and never surfaces paymentStatus,
// paymentProvider, paymentSessionId/ref_payco, paidAt, or the period
// covered). This shows every request, filterable/searchable by payment
// state, with a "Reverificar" action that force-checks a stuck "pending"
// payment against its provider on demand instead of waiting on the 15-min
// reconcile job or the 48h backstop.
//
// Payment-attempt-centric (one row per PlanUpgradeRequest) - see
// AdminSubscriptions.jsx for the customer-centric counterpart (one row per
// subscriber, showing what's active right now).
import React, { useContext, useEffect, useState } from "react";
import { Table, Tag, Select, Input, Button, Tooltip, Empty, Alert } from "antd";
import { ReloadOutlined, SyncOutlined, CopyOutlined, DollarCircleOutlined, ShopOutlined, SettingOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { subscriptionService } from "../services/subscriptionService";
import PageHeader from "../components/common/PageHeader";
import ManageSubscriptionModal, { SUBSCRIPTION_STATUS_STYLES, formatDate } from "../components/admin/ManageSubscriptionModal";

const PAYMENT_STATUS_STYLES = {
    pending: { color: "gold", label: "Pendiente" },
    paid: { color: "green", label: "Pagado" },
    rejected: { color: "red", label: "Rechazado" },
    failed: { color: "red", label: "Fallido" },
    expired: { color: "default", label: "Expirado" },
    cancelled: { color: "default", label: "Cancelado" },
    amount_mismatch: { color: "volcano", label: "Monto no coincide" },
};

const REQUEST_STATUS_STYLES = {
    open: { color: "blue", label: "Abierta" },
    reviewing: { color: "gold", label: "En revisión" },
    approved: { color: "cyan", label: "Aprobada" },
    rejected: { color: "red", label: "Rechazada" },
    closed: { color: "default", label: "Cerrada" },
};

const PAYMENT_STATUS_OPTIONS = Object.keys(PAYMENT_STATUS_STYLES);
const REQUEST_STATUS_OPTIONS = Object.keys(REQUEST_STATUS_STYLES);

// null = we genuinely never recorded a test/live flag for this row (every
// request created before this tracking existed) - shown distinctly from
// "confirmed real", not folded into it, since we can't actually vouch for it.
const TEST_MODE_STYLES = {
    true: { color: "purple", label: "Prueba" },
    false: { color: "green", label: "Real" },
    unknown: { color: "default", label: "Sin registrar" },
};

const AdminPayments = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [testModeFilter, setTestModeFilter] = useState("");
    const [hasCompanyFilter, setHasCompanyFilter] = useState("");
    const [search, setSearch] = useState("");
    const [reverifyingId, setReverifyingId] = useState("");
    const [manageTarget, setManageTarget] = useState(null); // { userId, email, username, company }

    const fetchPayments = async () => {
        try {
            setLoading(true);
            const response = await subscriptionService.getAdminPayments({
                paymentStatus: paymentStatusFilter,
                status: statusFilter,
                isTestPayment: testModeFilter,
                hasCompany: hasCompanyFilter,
                search,
                page,
                pageSize,
            });
            setRows(response?.data?.requests || []);
            setTotal(response?.data?.total || 0);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        fetchPayments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, paymentStatusFilter, statusFilter, testModeFilter, hasCompanyFilter, page, pageSize]);

    // Debounced search - a fresh keystroke resets to page 1 instead of
    // silently searching within whatever page the admin happened to be on.
    useEffect(() => {
        if (!isAdmin) return;
        const timer = setTimeout(() => {
            setPage(1);
            fetchPayments();
        }, 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

    const handleReverify = async (record) => {
        try {
            setReverifyingId(record.id);
            const response = await subscriptionService.reverifyAdminPayment(record.id);
            const result = response?.data;
            if (result?.changed) {
                toast.success(`Estado actualizado: ${PAYMENT_STATUS_STYLES[result.paymentStatus]?.label || result.paymentStatus}`);
            } else {
                toast("El proveedor no reportó ningún cambio todavía.");
            }
            await fetchPayments();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setReverifyingId("");
        }
    };

    const copyReference = (value) => {
        if (!value) return;
        navigator.clipboard?.writeText(value).then(
            () => toast.success("Referencia copiada"),
            () => {}
        );
    };

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert type="warning" showIcon message="Solo un administrador puede ver esta página." />
            </div>
        );
    }

    const columns = [
        {
            title: "Usuario",
            key: "user",
            render: (_, record) => (
                <div>
                    <div className="text-sm text-[var(--ohnix-text-primary)]">
                        {record.user?.username || record.user?.email || "-"}
                    </div>
                    <div className="text-xs text-[var(--ohnix-text-muted)]">{record.user?.email || "-"}</div>
                    {/* Only shown when the user actually belongs to a Company -
                        an individual/independent account gets no badge at all,
                        rather than an empty "Empresa: -" that implies one exists. */}
                    {record.user?.company?.name && (
                        <Tag icon={<ShopOutlined />} color="geekblue" className="!mt-1">
                            {record.user.company.name}
                        </Tag>
                    )}
                </div>
            ),
        },
        {
            title: "Suscripción actual",
            key: "currentSubscription",
            render: (_, record) => {
                const sub = record.currentSubscription;
                if (!sub) {
                    return <span className="text-xs text-[var(--ohnix-text-muted)]">-</span>;
                }
                return (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <Tag color={SUBSCRIPTION_STATUS_STYLES[sub.status]?.color || "default"}>
                                {sub.plan}
                            </Tag>
                            {sub.cancelAtPeriodEnd && <Tag color="volcano">No renueva</Tag>}
                        </div>
                        <span className="text-xs text-[var(--ohnix-text-muted)]">
                            {sub.endsAt ? `Vence ${formatDate(sub.endsAt)}` : "Sin vencimiento"}
                        </span>
                    </div>
                );
            },
        },
        {
            title: "Plan",
            key: "plan",
            render: (_, record) => (
                <span className="text-sm text-[var(--ohnix-text-primary)]">
                    {record.currentPlan} → <strong>{record.targetPlan}</strong>
                </span>
            ),
        },
        {
            title: "Estado solicitud",
            dataIndex: "status",
            key: "status",
            render: (value) => (
                <Tag color={REQUEST_STATUS_STYLES[value]?.color || "default"}>
                    {REQUEST_STATUS_STYLES[value]?.label || value}
                </Tag>
            ),
        },
        {
            title: "Estado de pago",
            dataIndex: "paymentStatus",
            key: "paymentStatus",
            render: (value) =>
                value ? (
                    <Tag color={PAYMENT_STATUS_STYLES[value]?.color || "default"}>
                        {PAYMENT_STATUS_STYLES[value]?.label || value}
                    </Tag>
                ) : (
                    <span className="text-xs text-[var(--ohnix-text-muted)]">-</span>
                ),
        },
        {
            title: "Modo",
            dataIndex: "isTestPayment",
            key: "isTestPayment",
            render: (value) => {
                const style = TEST_MODE_STYLES[value === null || value === undefined ? "unknown" : String(value)];
                return <Tag color={style.color}>{style.label}</Tag>;
            },
        },
        {
            title: "Proveedor",
            dataIndex: "paymentProvider",
            key: "paymentProvider",
            render: (value) => <span className="text-xs uppercase text-[var(--ohnix-text-muted)]">{value || "-"}</span>,
        },
        {
            title: "Referencia",
            dataIndex: "paymentSessionId",
            key: "paymentSessionId",
            render: (value) =>
                value ? (
                    <Tooltip title={value}>
                        <button
                            type="button"
                            onClick={() => copyReference(value)}
                            className="inline-flex items-center gap-1 text-xs text-[#29D8D5] hover:text-[#44F3F0]"
                        >
                            <span className="max-w-[110px] truncate">{value}</span>
                            <CopyOutlined />
                        </button>
                    </Tooltip>
                ) : (
                    <span className="text-xs text-[var(--ohnix-text-muted)]">-</span>
                ),
        },
        {
            title: "Creada",
            dataIndex: "createdAt",
            key: "createdAt",
            render: (value) => <span className="text-xs text-[var(--ohnix-text-muted)]">{formatDate(value)}</span>,
        },
        {
            title: "Pagado el",
            dataIndex: "paidAt",
            key: "paidAt",
            render: (value) => <span className="text-xs text-[var(--ohnix-text-muted)]">{formatDate(value)}</span>,
        },
        {
            title: "Acción",
            key: "action",
            render: (_, record) => {
                const canReverify = record.status === "approved" && record.paymentStatus === "pending";
                return (
                    <div className="flex flex-col gap-1.5">
                        <Button
                            size="small"
                            icon={<SyncOutlined spin={reverifyingId === record.id} />}
                            disabled={!canReverify}
                            loading={reverifyingId === record.id}
                            onClick={() => handleReverify(record)}
                            className="rounded-lg border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0] disabled:opacity-30"
                        >
                            Reverificar
                        </Button>
                        <Button
                            size="small"
                            icon={<SettingOutlined />}
                            disabled={!record.user?.id}
                            onClick={() =>
                                setManageTarget({
                                    userId: record.user?.id,
                                    email: record.user?.email,
                                    username: record.user?.username,
                                    company: record.user?.company,
                                })
                            }
                            className="rounded-lg border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-primary)]"
                        >
                            Suscripción
                        </Button>
                    </div>
                );
            },
        },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title="Pagos"
                subtitle="Ledger completo de pagos de upgrades - estado real del proveedor, referencia y acciones de verificación."
                icon={<DollarCircleOutlined />}
                actionButton={
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchPayments}
                        className="rounded-lg border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-primary)]"
                    >
                        Actualizar
                    </Button>
                }
            />

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <Select
                        value={paymentStatusFilter}
                        onChange={(value) => {
                            setPaymentStatusFilter(value);
                            setPage(1);
                        }}
                        options={[
                            { value: "", label: "Todos los estados de pago" },
                            ...PAYMENT_STATUS_OPTIONS.map((key) => ({
                                value: key,
                                label: PAYMENT_STATUS_STYLES[key].label,
                            })),
                        ]}
                    />
                    <Select
                        value={statusFilter}
                        onChange={(value) => {
                            setStatusFilter(value);
                            setPage(1);
                        }}
                        options={[
                            { value: "", label: "Todos los estados de solicitud" },
                            ...REQUEST_STATUS_OPTIONS.map((key) => ({
                                value: key,
                                label: REQUEST_STATUS_STYLES[key].label,
                            })),
                        ]}
                    />
                    <Select
                        value={testModeFilter}
                        onChange={(value) => {
                            setTestModeFilter(value);
                            setPage(1);
                        }}
                        options={[
                            { value: "", label: "Prueba y real" },
                            { value: "false", label: "Solo pagos reales" },
                            { value: "true", label: "Solo pruebas (sandbox)" },
                            { value: "unknown", label: "Sin registrar (anteriores)" },
                        ]}
                    />
                    <Select
                        value={hasCompanyFilter}
                        onChange={(value) => {
                            setHasCompanyFilter(value);
                            setPage(1);
                        }}
                        options={[
                            { value: "", label: "Empresas e independientes" },
                            { value: "true", label: "Solo empresas" },
                            { value: "false", label: "Solo independientes" },
                        ]}
                    />
                    <Input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar por email, usuario, empresa, ID o referencia"
                        allowClear
                    />
                </div>

                <div className="rounded-2xl border border-[var(--ohnix-line-3)] overflow-hidden overflow-x-auto">
                    <Table
                        rowKey="id"
                        loading={loading}
                        dataSource={rows}
                        columns={columns}
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={
                                        <span className="text-[var(--ohnix-text-muted)]">
                                            No hay pagos que coincidan con estos filtros.
                                        </span>
                                    }
                                />
                            ),
                        }}
                        pagination={{
                            current: page,
                            pageSize,
                            total,
                            showSizeChanger: true,
                            pageSizeOptions: ["10", "20", "50", "100"],
                            showTotal: (count) => `${count} pagos`,
                            onChange: (nextPage, nextPageSize) => {
                                setPage(nextPage);
                                setPageSize(nextPageSize);
                            },
                        }}
                    />
                </div>
            </div>

            <ManageSubscriptionModal
                target={manageTarget}
                onClose={() => setManageTarget(null)}
                onChanged={fetchPayments}
            />
        </div>
    );
};

export default AdminPayments;
