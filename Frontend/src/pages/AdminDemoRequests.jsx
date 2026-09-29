import { useContext, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Alert, Empty, Input, Table, Tabs, Tag } from "antd";
import { CheckCircleFilled, FileExcelOutlined, ScheduleOutlined, SearchOutlined } from "@ant-design/icons";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import PageHeader from "../components/common/PageHeader";
import DemoRequestDrawer from "../components/admin/DemoRequestDrawer";
import { DEMO_STATUSES, DEMO_STATUS_COLORS } from "../components/admin/demoRequestStatus";
import { useDemoRequests } from "../hooks/demoRequests/useDemoRequests";
import { getConnectivityState, subscribeConnectivity } from "../offline/connectivity";

// Prospects from the public /agenda-demo page (the Instagram/TikTok
// "comenta DEMO" funnel). ?id= deep-links straight into one request - the
// team notification email links here that way.
const AdminDemoRequests = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const isAdmin = user?.role === "admin";
    const [searchParams, setSearchParams] = useSearchParams();
    const [online, setOnline] = useState(getConnectivityState());
    const [filterKey, setFilterKey] = useState("all");
    const [search, setSearch] = useState("");
    const demo = useDemoRequests();

    useEffect(() => subscribeConnectivity(setOnline), []);

    const selectedId = searchParams.get("id");
    const selected = demo.requests.find((request) => request._id === selectedId) || null;
    const openRequest = (id) => setSearchParams(id ? { id } : {});

    const filtered = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return demo.requests.filter((request) => {
            if (filterKey !== "all" && request.status !== filterKey) return false;
            if (!needle) return true;
            return [request.name, request.company_name, request.email, request.phone].filter(Boolean).some((field) => field.toLowerCase().includes(needle));
        });
    }, [demo.requests, filterKey, search]);

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.only_admin")} />
            </div>
        );
    }

    const countFor = (status) => demo.requests.filter((request) => request.status === status).length;
    const tabItems = [
        { key: "all", label: `${t("admin_demo_requests.filter_all")} (${demo.requests.length})` },
        ...DEMO_STATUSES.map((status) => ({ key: status, label: `${t(`admin_demo_requests.status_${status}`)} (${countFor(status)})` })),
    ];

    const columns = [
        {
            title: t("admin_demo_requests.col_received"),
            dataIndex: "created_at",
            key: "created_at",
            render: (value) => (value ? new Date(value).toLocaleString() : "—"),
        },
        {
            title: t("admin_demo_requests.col_prospect"),
            key: "prospect",
            render: (_, record) => (
                <div>
                    <div className="font-semibold">{record.company_name}</div>
                    <div className="text-xs text-[var(--ohnix-text-muted)]">
                        {record.name} · {record.phone}
                    </div>
                </div>
            ),
        },
        {
            title: t("admin_demo_requests.col_preferred"),
            key: "preferred",
            render: (_, record) =>
                record.preferred_date
                    ? `${record.preferred_date}${record.preferred_slot ? ` · ${t(`admin_demo_requests.slot_${record.preferred_slot}`)}` : ""}`
                    : "—",
        },
        {
            title: t("admin_demo_requests.col_catalog"),
            key: "catalog",
            render: (_, record) =>
                record.catalog_row_count ? (
                    <span className="inline-flex items-center gap-1 text-[var(--ohnix-accent)]">
                        <FileExcelOutlined /> {t("admin_demo_requests.catalog_rows", { count: record.catalog_row_count })}
                    </span>
                ) : record.has_catalog_file ? (
                    <FileExcelOutlined className="text-amber-400" />
                ) : (
                    <span className="text-[var(--ohnix-text-dim)]">{t("admin_demo_requests.no_catalog")}</span>
                ),
        },
        {
            title: t("admin_demo_requests.col_status"),
            dataIndex: "status",
            key: "status",
            render: (status, record) => (
                <Tag color={DEMO_STATUS_COLORS[status]}>
                    {t(`admin_demo_requests.status_${status}`)}
                    {record._pendingSync ? " ·" : ""}
                </Tag>
            ),
        },
        {
            title: t("admin_demo_requests.col_account"),
            key: "account",
            render: (_, record) =>
                record.provisioned_user_id ? (
                    <span className="inline-flex items-center gap-1">
                        <CheckCircleFilled className="text-[var(--ohnix-accent)]" /> {record.provisioned_username}
                    </span>
                ) : (
                    "—"
                ),
        },
    ];

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader title={t("admin_demo_requests.title")} subtitle={t("admin_demo_requests.subtitle")} icon={<ScheduleOutlined />} />

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <Tabs activeKey={filterKey} onChange={setFilterKey} className="admin-tabs" items={tabItems} />
                <div className="mb-4">
                    <Input
                        allowClear
                        prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="max-w-xs"
                    />
                </div>
                <Table
                    className="module-dark-table"
                    rowKey="_id"
                    columns={columns}
                    dataSource={filtered}
                    loading={demo.loading}
                    pagination={{ pageSize: 20 }}
                    onRow={(record) => ({ onClick: () => openRequest(record._id), style: { cursor: "pointer" } })}
                    locale={{ emptyText: <Empty description={t("admin_demo_requests.empty")} /> }}
                    scroll={{ x: true }}
                />
            </div>

            <DemoRequestDrawer
                request={selected}
                open={!!selected}
                online={online}
                onClose={() => openRequest(null)}
                onUpdate={demo.updateRequest}
                fetchDetail={demo.fetchDetail}
                previewImport={demo.previewImport}
                provision={demo.provision}
                sendAccess={demo.sendAccess}
                downloadCatalogFile={demo.downloadCatalogFile}
            />
        </div>
    );
};

export default AdminDemoRequests;
