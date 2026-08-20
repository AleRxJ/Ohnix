// Frontend/src/pages/AdminSubscriptions.jsx
//
// Customer-centric admin view: one row per subscriber, showing the plan
// they actually have active right now - the counterpart to
// AdminPayments.jsx, which is payment-attempt-centric (one row per
// PlanUpgradeRequest, so a user who's upgraded/renewed several times shows
// up several times with no obvious "which one is current"). This is the
// view for "manage this person/company's plan", not "audit this payment".
import React, { useContext, useEffect, useState } from "react";
import { Table, Tag, Select, Input, Button, Empty, Alert } from "antd";
import { ReloadOutlined, SettingOutlined, ShopOutlined, CrownOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { subscriptionService } from "../services/subscriptionService";
import PageHeader from "../components/common/PageHeader";
import ManageSubscriptionModal, { SUBSCRIPTION_STATUS_STYLES, formatDate } from "../components/admin/ManageSubscriptionModal";

const PLAN_STYLES = {
    starter: { color: "default", label: "Emprendedor" },
    growth: { color: "cyan", label: "Negocio" },
    scale: { color: "purple", label: "Escala" },
    enterprise: { color: "gold", label: "Enterprise" },
};
const PLAN_OPTIONS = Object.keys(PLAN_STYLES);

const STATUS_LABELS = { active: "Activa", paused: "Pausada", canceled: "Cancelada" };

const AdminSubscriptions = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);
    const [planFilter, setPlanFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [hasCompanyFilter, setHasCompanyFilter] = useState("");
    const [search, setSearch] = useState("");
    const [manageTarget, setManageTarget] = useState(null);

    const fetchSubscriptions = async () => {
        try {
            setLoading(true);
            const response = await subscriptionService.getAdminSubscriptions({
                plan: planFilter,
                status: statusFilter,
                hasCompany: hasCompanyFilter,
                search,
                page,
                pageSize,
            });
            setRows(response?.data?.subscriptions || []);
            setTotal(response?.data?.total || 0);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        fetchSubscriptions();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin, planFilter, statusFilter, hasCompanyFilter, page, pageSize]);

    useEffect(() => {
        if (!isAdmin) return;
        const timer = setTimeout(() => {
            setPage(1);
            fetchSubscriptions();
        }, 400);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [search]);

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
                    {record.user?.company?.name && (
                        <Tag icon={<ShopOutlined />} color="geekblue" className="!mt-1">
                            {record.user.company.name}
                        </Tag>
                    )}
                </div>
            ),
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
                    onClick={() =>
                        setManageTarget({
                            userId: record.user?.id,
                            email: record.user?.email,
                            username: record.user?.username,
                            company: record.user?.company,
                        })
                    }
                    className="rounded-lg border-[#29D8D5]/35 bg-[#29D8D5]/10 text-[#44F3F0]"
                >
                    Gestionar
                </Button>
            ),
        },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title="Suscripciones"
                subtitle="Un renglón por cliente/empresa con el plan realmente activo ahora mismo - distinto al ledger de pagos, que es por intento de pago."
                icon={<CrownOutlined />}
                actionButton={
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={fetchSubscriptions}
                        className="rounded-lg border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-primary)]"
                    >
                        Actualizar
                    </Button>
                }
            />

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <Select
                        value={planFilter}
                        onChange={(value) => {
                            setPlanFilter(value);
                            setPage(1);
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
                            setPage(1);
                        }}
                        options={[
                            { value: "", label: "Todos los estados" },
                            ...Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
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
                        placeholder="Buscar por email, usuario o empresa"
                        allowClear
                    />
                </div>

                <div className="rounded-2xl border border-[var(--ohnix-line-3)] overflow-hidden overflow-x-auto">
                    <Table
                        rowKey="userId"
                        loading={loading}
                        dataSource={rows}
                        columns={columns}
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
                            current: page,
                            pageSize,
                            total,
                            showSizeChanger: true,
                            pageSizeOptions: ["10", "20", "50", "100"],
                            showTotal: (count) => `${count} suscripciones`,
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
                onChanged={fetchSubscriptions}
            />
        </div>
    );
};

export default AdminSubscriptions;
