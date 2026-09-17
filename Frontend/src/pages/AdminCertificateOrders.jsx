// Frontend/src/pages/AdminCertificateOrders.jsx
//
// Cross-company CertificateOrder visibility for Ohnix ops - read-only list of
// every company's digital-certificate purchase (provider, payment status,
// expiration) in one place. Complements AdminFirmaPassValidations.jsx (which
// is FirmaPass's own alliance-wide, non-company-scoped validation queue) and
// AdminDianTestMatrix.jsx (per-company test-matrix column) - neither of those
// answers "who has a certificate and when does it expire" across companies.
import { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Empty, Input, Table, Tabs, Tag } from "antd";
import { CreditCardOutlined, SearchOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { adminService } from "../services/adminService";
import PageHeader from "../components/common/PageHeader";

// Same paymentStatus vocabulary as CertificateOrder.paymentStatus in
// schema.prisma / certificateOrder.service.js#resolvePendingCertificateOrderPaymentStatus.
const PAYMENT_STATUS_COLOR = {
    paid: "green",
    pending: "gold",
    rejected: "red",
    failed: "red",
    amount_mismatch: "red",
    cancelled: "default",
    expired: "default",
};

const FAILED_STATUSES = ["rejected", "failed", "amount_mismatch"];

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Days-to-expiration bucket, computed client-side from the raw
// entitlementEndsAt date - there is no backend field for this, it's purely a
// display affordance so ops can spot "about to lapse" without doing the math
// themselves.
const daysUntil = (dateValue) => {
    if (!dateValue) return null;
    const diffMs = new Date(dateValue).getTime() - Date.now();
    return Math.ceil(diffMs / MS_PER_DAY);
};

const AdminCertificateOrders = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [loading, setLoading] = useState(true);
    const [orders, setOrders] = useState([]);
    const [search, setSearch] = useState("");
    const [filterKey, setFilterKey] = useState("all");

    const fetchData = async () => {
        try {
            setLoading(true);
            const response = await adminService.listCertificateOrders();
            setOrders(response?.data || []);
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isAdmin) return;
        fetchData();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAdmin]);

    const isExpiringSoon = (order) => {
        if (order.paymentStatus !== "paid" || !order.entitlementEndsAt) return false;
        const days = daysUntil(order.entitlementEndsAt);
        return days !== null && days >= 0 && days <= 30;
    };

    const filteredOrders = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return orders.filter((order) => {
            if (filterKey === "paid" && order.paymentStatus !== "paid") return false;
            if (filterKey === "expiring_soon" && !isExpiringSoon(order)) return false;
            if (filterKey === "pending" && order.paymentStatus !== "pending") return false;
            if (filterKey === "failed" && !FAILED_STATUSES.includes(order.paymentStatus)) return false;
            if (!needle) return true;
            return [order.company?.name, order.company?.taxIdentification].filter(Boolean).some((field) =>
                field.toLowerCase().includes(needle)
            );
        });
    }, [orders, search, filterKey]);

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.only_admin")} />
            </div>
        );
    }

    const formatAmount = (amount, currency) => {
        if (amount === null || amount === undefined) return "—";
        return `${new Intl.NumberFormat("es-CO").format(amount)} ${currency || ""}`.trim();
    };

    const formatDate = (value) => (value ? new Date(value).toLocaleDateString() : "—");

    const renderExpiry = (value) => {
        if (!value) return <span className="text-[var(--ohnix-text-dim)]">—</span>;
        const days = daysUntil(value);
        let toneClass = "text-[var(--ohnix-text-muted)]";
        let label;
        if (days === null) {
            label = null;
        } else if (days < 0) {
            label = t("admin.certificate_orders_expired_days_ago", { count: Math.abs(days) });
            toneClass = "text-[var(--ohnix-danger,#f87171)]";
        } else if (days <= 7) {
            label = t("admin.certificate_orders_expires_in_days", { count: days });
            toneClass = "text-[var(--ohnix-danger,#f87171)]";
        } else if (days <= 30) {
            label = t("admin.certificate_orders_expires_in_days", { count: days });
            toneClass = "text-amber-400";
        } else {
            label = t("admin.certificate_orders_expires_in_days", { count: days });
        }
        return (
            <div>
                <div>{formatDate(value)}</div>
                {label && <div className={`text-xs ${toneClass}`}>{label}</div>}
            </div>
        );
    };

    const columns = [
        {
            title: t("admin.certificate_orders_col_company"),
            dataIndex: ["company", "name"],
            key: "company",
            render: (_, record) => (
                <div>
                    <div className="text-[var(--ohnix-text-primary)]">{record.company?.name || "—"}</div>
                    <div className="text-xs text-[var(--ohnix-text-muted)]">
                        {[record.company?.legalName, record.company?.taxIdentification].filter(Boolean).join(" · ") || "—"}
                    </div>
                </div>
            ),
        },
        {
            title: t("admin.certificate_orders_col_provider"),
            dataIndex: ["company", "electronicInvoicingProvider"],
            key: "provider",
            render: (value) => (value ? <Tag>{value}</Tag> : "—"),
        },
        {
            title: t("admin.certificate_orders_col_duration"),
            dataIndex: "durationYears",
            key: "durationYears",
            render: (value) =>
                value === 1
                    ? t("admin.certificate_orders_duration_1_year")
                    : value === 2
                        ? t("admin.certificate_orders_duration_2_years")
                        : value || "—",
        },
        {
            title: t("admin.certificate_orders_col_amount"),
            key: "amount",
            render: (_, record) => formatAmount(record.amount, record.currency),
        },
        {
            title: t("admin.certificate_orders_col_payment_status"),
            dataIndex: "paymentStatus",
            key: "paymentStatus",
            render: (value) => (
                <Tag color={PAYMENT_STATUS_COLOR[value] || "default"}>
                    {t(`admin.certificate_orders_status_${value}`, { defaultValue: value || "—" })}
                </Tag>
            ),
        },
        {
            title: t("admin.certificate_orders_col_expires"),
            dataIndex: "entitlementEndsAt",
            key: "entitlementEndsAt",
            render: (value) => renderExpiry(value),
        },
        {
            title: t("admin.certificate_orders_col_requested_by"),
            dataIndex: ["requestedByUser", "email"],
            key: "requestedBy",
            render: (value) => value || "—",
        },
        {
            title: t("admin.certificate_orders_col_created"),
            dataIndex: "createdAt",
            key: "createdAt",
            render: (value) => formatDate(value),
        },
    ];

    const tabItems = [
        { key: "all", label: t("admin.certificate_orders_filter_all") },
        { key: "paid", label: t("admin.certificate_orders_filter_paid") },
        { key: "expiring_soon", label: t("admin.certificate_orders_filter_expiring_soon") },
        { key: "pending", label: t("admin.certificate_orders_filter_pending") },
        { key: "failed", label: t("admin.certificate_orders_filter_failed") },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title={t("admin.certificate_orders_title")}
                subtitle={t("admin.certificate_orders_subtitle")}
                icon={<CreditCardOutlined />}
            />

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <Tabs
                    activeKey={filterKey}
                    onChange={setFilterKey}
                    className="admin-tabs"
                    items={tabItems}
                />

                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <Input
                        allowClear
                        prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                        placeholder={t("admin.certificate_orders_search_placeholder")}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-xs"
                    />
                </div>

                <Table
                    className="module-dark-table"
                    rowKey="id"
                    columns={columns}
                    dataSource={filteredOrders}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{
                        emptyText: (
                            <Empty
                                description={
                                    search || filterKey !== "all"
                                        ? t("admin.certificate_orders_no_matches")
                                        : t("admin.certificate_orders_empty")
                                }
                            />
                        ),
                    }}
                    scroll={{ x: true }}
                />
            </div>
        </div>
    );
};

export default AdminCertificateOrders;
