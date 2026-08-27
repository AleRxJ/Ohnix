// Frontend/src/pages/AdminSubscriptions.jsx
//
// Single admin billing module, split into two tabs instead of two pages:
//
// - "Suscripciones activas": one row per subscriber, showing the plan they
//   actually have active right now.
// - "Pagos": the full payment-attempt ledger (one row per
//   PlanUpgradeRequest), so an admin can see every payment that has come in
//   - not just the current subscribers - filter/search it, and force a
//   provider re-check on a stuck "pending" payment.
//
// These used to be two separate top-level pages, then got merged into just
// the subscribers view on the theory that "show me this person's payments"
// (still available per-row via "Gestionar" -> ManageSubscriptionModal) was
// the only reason anyone needed the ledger. That dropped the "show me every
// payment that came in, across all users" view an admin also needs - this
// restores it as a second tab in the same module rather than reviving it as
// its own page.
import React, { useContext, useEffect, useState } from "react";
import { Table, Tag, Select, Input, Button, Tooltip, Empty, Alert, Tabs } from "antd";
import {
    ReloadOutlined,
    SettingOutlined,
    ShopOutlined,
    CrownOutlined,
    SyncOutlined,
    CopyOutlined,
    DollarCircleOutlined,
} from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { subscriptionService } from "../services/subscriptionService";
import PageHeader from "../components/common/PageHeader";
import ManageSubscriptionModal, {
    SUBSCRIPTION_STATUS_STYLES,
    PAYMENT_STATUS_STYLES,
    TEST_MODE_STYLES,
    PLAN_STYLES,
    formatDate,
} from "../components/admin/ManageSubscriptionModal";

const PLAN_OPTIONS = Object.keys(PLAN_STYLES);

const STATUS_LABELS = { active: "Activa", paused: "Pausada", canceled: "Cancelada" };

const REQUEST_STATUS_STYLES = {
    open: { color: "blue", label: "Abierta" },
    reviewing: { color: "gold", label: "En revisión" },
    approved: { color: "cyan", label: "Aprobada" },
    rejected: { color: "red", label: "Rechazada" },
    closed: { color: "default", label: "Cerrada" },
};
const PAYMENT_STATUS_OPTIONS = Object.keys(PAYMENT_STATUS_STYLES);
const REQUEST_STATUS_OPTIONS = Object.keys(REQUEST_STATUS_STYLES);

const CompanyBadge = ({ user }) =>
    user?.company?.name ? (
        <Tag icon={<ShopOutlined />} color="geekblue" className="!mt-1">
            {user.company.name}
        </Tag>
    ) : null;

const UserCell = ({ user }) => (
    <div>
        <div className="text-sm text-[var(--ohnix-text-primary)]">{user?.username || user?.email || "-"}</div>
        <div className="text-xs text-[var(--ohnix-text-muted)]">{user?.email || "-"}</div>
        <CompanyBadge user={user} />
    </div>
);

const AdminSubscriptions = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [manageTarget, setManageTarget] = useState(null);
    const openManage = (targetUser) =>
        setManageTarget({
            userId: targetUser?.id,
            email: targetUser?.email,
            username: targetUser?.username,
            company: targetUser?.company,
        });

    // --- Suscripciones activas -------------------------------------------------
    const [subLoading, setSubLoading] = useState(true);
    const [subRows, setSubRows] = useState([]);
    const [subTotal, setSubTotal] = useState(0);
    const [subPage, setSubPage] = useState(1);
    const [subPageSize, setSubPageSize] = useState(20);
    const [planFilter, setPlanFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [subHasCompanyFilter, setSubHasCompanyFilter] = useState("");
    const [subSearch, setSubSearch] = useState("");

    const fetchSubscriptions = async () => {
        try {
            setSubLoading(true);
            const response = await subscriptionService.getAdminSubscriptions({
                plan: planFilter,
                status: statusFilter,
                hasCompany: subHasCompanyFilter,
                search: subSearch,
                page: subPage,
                pageSize: subPageSize,
            });
            setSubRows(response?.data?.subscriptions || []);
            setSubTotal(response?.data?.total || 0);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setSubLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        fetchSubscriptions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, planFilter, statusFilter, subHasCompanyFilter, subPage, subPageSize]);

    useEffect(() => {
        if (!isAdmin) return;
        const timer = setTimeout(() => {
            setSubPage(1);
            fetchSubscriptions();
        }, 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subSearch]);

    // --- Pagos (ledger completo) -------------------------------------------------
    const [payLoading, setPayLoading] = useState(true);
    const [payRows, setPayRows] = useState([]);
    const [payTotal, setPayTotal] = useState(0);
    const [payPage, setPayPage] = useState(1);
    const [payPageSize, setPayPageSize] = useState(20);
    const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
    const [requestStatusFilter, setRequestStatusFilter] = useState("");
    const [testModeFilter, setTestModeFilter] = useState("");
    const [payHasCompanyFilter, setPayHasCompanyFilter] = useState("");
    const [paySearch, setPaySearch] = useState("");
    const [reverifyingId, setReverifyingId] = useState("");

    const fetchPayments = async () => {
        try {
            setPayLoading(true);
            const response = await subscriptionService.getAdminPayments({
                paymentStatus: paymentStatusFilter,
                status: requestStatusFilter,
                isTestPayment: testModeFilter,
                hasCompany: payHasCompanyFilter,
                search: paySearch,
                page: payPage,
                pageSize: payPageSize,
            });
            setPayRows(response?.data?.requests || []);
            setPayTotal(response?.data?.total || 0);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setPayLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        fetchPayments();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, paymentStatusFilter, requestStatusFilter, testModeFilter, payHasCompanyFilter, payPage, payPageSize]);

    useEffect(() => {
        if (!isAdmin) return;
        const timer = setTimeout(() => {
            setPayPage(1);
            fetchPayments();
        }, 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [paySearch]);

    const handleReverify = async (record) => {
        try {
            setReverifyingId(record.id);
            const response = await subscriptionService.reverifyAdminPayment(record.id);
            const result = response?.data;
            toast.success(
                result?.changed
                    ? `Estado actualizado: ${PAYMENT_STATUS_STYLES[result.paymentStatus]?.label || result.paymentStatus}`
                    : "El proveedor no reportó ningún cambio todavía."
            );
            await fetchPayments();
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setReverifyingId("");
        }
    };

    const copyReference = (value) => {
        if (!value) return;
        navigator.clipboard?.writeText(value).then(() => toast.success("Referencia copiada"), () => {});
    };

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message="Solo un administrador puede ver esta página." />
            </div>
        );
    }

    const subscriptionColumns = [
        {
            title: "Usuario",
            key: "user",
            render: (_, record) => <UserCell user={record.user} />,
        },
        {
            title: "Plan",
            dataIndex: "plan",
            key: "plan",
            render: (value) => (
                <Tag icon={<CrownOutlined />} color={PLAN_STYLES[value]?.color || "default"}>
                    {PLAN_STYLES[value]?.label || value}
                </Tag>
            ),
        },
        {
            title: "Estado",
            key: "status",
            render: (_, record) => (
                <div className="flex flex-wrap items-center gap-1.5">
                    <Tag color={SUBSCRIPTION_STATUS_STYLES[record.status]?.color || "default"}>
                        {STATUS_LABELS[record.status] || record.status}
                    </Tag>
                    {record.cancelAtPeriodEnd && <Tag color="volcano">No renueva</Tag>}
                </div>
            ),
        },
        {
            title: "Vence",
            dataIndex: "endsAt",
            key: "endsAt",
            render: (value) => (
                <span className="text-xs text-[var(--ohnix-text-muted)]">
                    {value ? formatDate(value) : "Sin vencimiento"}
                </span>
            ),
        },
        {
            title: "Prueba hasta",
            dataIndex: "trialEndsAt",
            key: "trialEndsAt",
            render: (value) => <span className="text-xs text-[var(--ohnix-text-muted)]">{value ? formatDate(value) : "-"}</span>,
        },
        {
            title: "Desde",
            dataIndex: "startedAt",
            key: "startedAt",
            render: (value) => <span className="text-xs text-[var(--ohnix-text-muted)]">{formatDate(value)}</span>,
        },
        {
            title: "Última actividad",
            dataIndex: "updatedAt",
            key: "updatedAt",
            render: (value) => <span className="text-xs text-[var(--ohnix-text-muted)]">{formatDate(value)}</span>,
        },
        {
            title: "Acción",
            key: "action",
            render: (_, record) => (
                <Button
                    size="small"
                    icon={<SettingOutlined />}
                    disabled={!record.user?.id}
                    onClick={() => openManage(record.user)}
                    className="rounded-lg border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0]"
                >
                    Gestionar
                </Button>
            ),
        },
    ];

    const paymentColumns = [
        {
            title: "Usuario",
            key: "user",
            render: (_, record) => <UserCell user={record.user} />,
        },
        {
            title: "Suscripción actual",
            key: "currentSubscription",
            render: (_, record) => {
                const sub = record.currentSubscription;
                if (!sub) return <span className="text-xs text-[var(--ohnix-text-muted)]">-</span>;
                return (
                    <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-1.5">
                            <Tag color={SUBSCRIPTION_STATUS_STYLES[sub.status]?.color || "default"}>{sub.plan}</Tag>
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
                            onClick={() => openManage(record.user)}
                            className="rounded-lg border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-primary)]"
                        >
                            Suscripción
                        </Button>
                    </div>
                );
            },
        },
    ];

    const tabItems = [
        {
            key: "subscriptions",
            label: (
                <span className="inline-flex items-center gap-1.5">
                    <CrownOutlined /> Suscripciones activas
                </span>
            ),
            children: (
                <div>
                    <div className="mb-3 flex justify-end">
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={fetchSubscriptions}
                            className="rounded-lg border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-primary)]"
                        >
                            Actualizar
                        </Button>
                    </div>
                    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                        <Select
                            value={planFilter}
                            onChange={(value) => {
                                setPlanFilter(value);
                                setSubPage(1);
                            }}
                            options={[
                                { value: "", label: "Todos los planes" },
                                ...PLAN_OPTIONS.map((key) => ({ value: key, label: PLAN_STYLES[key].label })),
                            ]}
                        />
                        <Select
                            value={statusFilter}
                            onChange={(value) => {
                                setStatusFilter(value);
                                setSubPage(1);
                            }}
                            options={[
                                { value: "", label: "Todos los estados" },
                                ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
                            ]}
                        />
                        <Select
                            value={subHasCompanyFilter}
                            onChange={(value) => {
                                setSubHasCompanyFilter(value);
                                setSubPage(1);
                            }}
                            options={[
                                { value: "", label: "Empresas e independientes" },
                                { value: "true", label: "Solo empresas" },
                                { value: "false", label: "Solo independientes" },
                            ]}
                        />
                        <Input
                            value={subSearch}
                            onChange={(event) => setSubSearch(event.target.value)}
                            placeholder="Buscar por email, usuario o empresa"
                            allowClear
                        />
                    </div>

                    <div className="rounded-2xl border border-[var(--ohnix-line-3)] overflow-hidden overflow-x-auto">
                        <Table
                            className="module-dark-table"
                            rowKey="userId"
                            loading={subLoading}
                            dataSource={subRows}
                            columns={subscriptionColumns}
                            scroll={{ x: "max-content" }}
                            locale={{
                                emptyText: (
                                    <Empty
                                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                                        description={
                                            <span className="text-[var(--ohnix-text-muted)]">
                                                No hay suscripciones que coincidan con estos filtros.
                                            </span>
                                        }
                                    />
                                ),
                            }}
                            pagination={{
                                current: subPage,
                                pageSize: subPageSize,
                                total: subTotal,
                                showSizeChanger: true,
                                pageSizeOptions: ["10", "20", "50", "100"],
                                showTotal: (count) => `${count} suscripciones`,
                                onChange: (nextPage, nextPageSize) => {
                                    setSubPage(nextPage);
                                    setSubPageSize(nextPageSize);
                                },
                            }}
                        />
                    </div>
                </div>
            ),
        },
        {
            key: "payments",
            label: (
                <span className="inline-flex items-center gap-1.5">
                    <DollarCircleOutlined /> Pagos
                </span>
            ),
            children: (
                <div>
                    <div className="mb-3 flex justify-end">
                        <Button
                            icon={<ReloadOutlined />}
                            onClick={fetchPayments}
                            className="rounded-lg border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-primary)]"
                        >
                            Actualizar
                        </Button>
                    </div>
                    <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        <Select
                            value={paymentStatusFilter}
                            onChange={(value) => {
                                setPaymentStatusFilter(value);
                                setPayPage(1);
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
                            value={requestStatusFilter}
                            onChange={(value) => {
                                setRequestStatusFilter(value);
                                setPayPage(1);
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
                                setPayPage(1);
                            }}
                            options={[
                                { value: "", label: "Prueba y real" },
                                { value: "false", label: "Solo pagos reales" },
                                { value: "true", label: "Solo pruebas (sandbox)" },
                                { value: "unknown", label: "Sin registrar (anteriores)" },
                            ]}
                        />
                        <Select
                            value={payHasCompanyFilter}
                            onChange={(value) => {
                                setPayHasCompanyFilter(value);
                                setPayPage(1);
                            }}
                            options={[
                                { value: "", label: "Empresas e independientes" },
                                { value: "true", label: "Solo empresas" },
                                { value: "false", label: "Solo independientes" },
                            ]}
                        />
                        <Input
                            value={paySearch}
                            onChange={(event) => setPaySearch(event.target.value)}
                            placeholder="Buscar por email, usuario, empresa, ID o referencia"
                            allowClear
                            className="sm:col-span-2 lg:col-span-1"
                        />
                    </div>

                    <div className="rounded-2xl border border-[var(--ohnix-line-3)] overflow-hidden overflow-x-auto">
                        <Table
                            className="module-dark-table"
                            rowKey="id"
                            loading={payLoading}
                            dataSource={payRows}
                            columns={paymentColumns}
                            scroll={{ x: "max-content" }}
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
                                current: payPage,
                                pageSize: payPageSize,
                                total: payTotal,
                                showSizeChanger: true,
                                pageSizeOptions: ["10", "20", "50", "100"],
                                showTotal: (count) => `${count} pagos`,
                                onChange: (nextPage, nextPageSize) => {
                                    setPayPage(nextPage);
                                    setPayPageSize(nextPageSize);
                                },
                            }}
                        />
                    </div>
                </div>
            ),
        },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title="Suscripciones y pagos"
                subtitle="Suscripciones activas: un renglón por cliente/empresa con el plan realmente activo ahora mismo. Pagos: cada intento de pago registrado, sin importar el estado actual de la suscripción."
                icon={<CrownOutlined />}
            />

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <Tabs className="admin-tabs" items={tabItems} defaultActiveKey="subscriptions" />
            </div>

            <ManageSubscriptionModal
                target={manageTarget}
                onClose={() => setManageTarget(null)}
                onChanged={() => {
                    fetchSubscriptions();
                    fetchPayments();
                }}
            />
        </div>
    );
};

export default AdminSubscriptions;
