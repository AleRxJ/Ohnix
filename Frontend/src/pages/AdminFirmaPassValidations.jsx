/* eslint-disable react/prop-types */
import { useContext, useEffect, useMemo, useState } from "react";
import { Alert, Button, Empty, Input, Modal, Select, Spin, Table, Tag, Tooltip } from "antd";
import { CopyOutlined, EyeOutlined, ReloadOutlined, SafetyCertificateOutlined, SearchOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../context/AuthContext";
import useI18n from "../hooks/useI18n";
import { adminService } from "../services/adminService";
import PageHeader from "../components/common/PageHeader";

// FirmaPass's own estado codes (verified against its Postman collection) -
// "d"/"r" are terminal/negative, "e" is fully issued, "pe" is mid-issuance,
// "p"/"pvi" are what an admin actually needs to act on here.
const ESTADO_COLOR = {
    p: "orange",
    pvi: "gold",
    pe: "blue",
    e: "green",
    r: "red",
    d: "red",
};

const DetailRow = ({ label, value }) => (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--ohnix-line-2)] py-2 last:border-0">
        <span className="text-xs uppercase tracking-wide text-[var(--ohnix-text-muted)]">{label}</span>
        <span className="text-right text-sm text-[var(--ohnix-text-primary)]">{value ?? "—"}</span>
    </div>
);

// Alliance-wide FirmaPass validation queue (not scoped to any Ohnix
// company, and growing with EVERY client's certificate purchase - see
// Backend/services/firmaPassProvisioning.service.js and
// Backend/utils/firmaPassValidationScheduler.js, the email alert this page
// complements). A validation only shows up here after a client buys a
// certificate on FirmaPass's own site with iTCycle's coupon; matching one to
// an Ohnix company is a human judgment call, so the search/filters below
// exist to narrow a list that has no per-company scoping at the API level.
// `owner_email` (the FirmaPass account's own email, not necessarily the
// client's Ohnix login) is the most specific identifying field FirmaPass
// actually returns - surfaced as its own column/search dimension instead of
// only the generic `nombre` label.
const AdminFirmaPassValidations = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [loading, setLoading] = useState(true);
    const [validations, setValidations] = useState([]);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState(null);
    const [categoryFilter, setCategoryFilter] = useState(null);

    // Certificate detail (issued/expires/serial, etc.) only exists on the
    // per-UUID FirmaPass endpoint, not the list one (confirmed against the
    // real API - current_certificate is always null on the list response,
    // even for an already-issued certificate) - fetched on demand per row
    // instead of eagerly for every row to avoid an N+1 call for a list that
    // can have 100+ entries.
    const [detailUuid, setDetailUuid] = useState(null);
    const [detailLoading, setDetailLoading] = useState(false);
    const [detailData, setDetailData] = useState(null);

    const fetchData = async () => {
        try {
            setLoading(true);
            const response = await adminService.listFirmaPassValidations({ perPage: 100 });
            setValidations(response?.data?.data || []);
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

    const copyUuid = async (uuid) => {
        try {
            await navigator.clipboard.writeText(uuid);
            toast.success(t("admin.firmapass_validations_uuid_copied"));
        } catch {
            // Clipboard API can be unavailable (permissions, insecure context) - the value is still visible in the table.
        }
    };

    const openDetail = async (uuid) => {
        setDetailUuid(uuid);
        setDetailData(null);
        setDetailLoading(true);
        try {
            const response = await adminService.getFirmaPassValidationDetail(uuid);
            // Double envelope: Ohnix's own ApiResponse wraps itcycle-api-dian's
            // passthrough, which itself wraps FirmaPass's own {message, data}
            // shape - see Backend/services/itcycleDian.service.js's
            // getItcycleFirmaPassValidationDetail (raw passthrough, no unwrapping).
            setDetailData(response?.data?.data || null);
        } catch (error) {
            toast.error(error.response?.data?.message || t("admin.firmapass_validations_detail_load_error"));
            setDetailUuid(null);
        } finally {
            setDetailLoading(false);
        }
    };

    const closeDetail = () => {
        setDetailUuid(null);
        setDetailData(null);
    };

    // Built from whatever the current dataset actually contains, not a fixed
    // list - FirmaPass's estado/categoria vocabulary isn't documented as a
    // closed set, and a stale hardcoded list would silently hide filter
    // options for values it doesn't know about yet.
    const statusOptions = useMemo(() => {
        const seen = new Map();
        validations.forEach((v) => { if (v.estado && !seen.has(v.estado)) seen.set(v.estado, v.estado_descripcion || v.estado); });
        return Array.from(seen, ([value, label]) => ({ value, label }));
    }, [validations]);

    const categoryOptions = useMemo(() => {
        const seen = new Set();
        validations.forEach((v) => { if (v.categoria_tipo_descripcion) seen.add(v.categoria_tipo_descripcion); });
        return Array.from(seen, (value) => ({ value, label: value }));
    }, [validations]);

    const filteredValidations = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return validations.filter((v) => {
            if (statusFilter && v.estado !== statusFilter) return false;
            if (categoryFilter && v.categoria_tipo_descripcion !== categoryFilter) return false;
            if (!needle) return true;
            return [v.nombre, v.owner_email, v.order_number, v.uuid].filter(Boolean).some((field) => field.toLowerCase().includes(needle));
        });
    }, [validations, search, statusFilter, categoryFilter]);

    if (!isAdmin) {
        return (
            <div className="p-6 sm:p-8">
                <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.only_admin")} />
            </div>
        );
    }

    const columns = [
        { title: t("admin.firmapass_validations_col_name"), dataIndex: "nombre", key: "nombre", render: (value) => value || "—" },
        {
            title: t("admin.firmapass_validations_col_email"),
            dataIndex: "owner_email",
            key: "owner_email",
            render: (value) => value || "—",
        },
        {
            // Only set once a real purchase (not this alliance's
            // coupon-attached test validations) carries an order - the most
            // reliable way to confirm "this specific client already paid".
            title: t("admin.firmapass_validations_col_order"),
            dataIndex: "order_number",
            key: "order_number",
            render: (value) => (value ? <span className="font-mono text-xs">{value}</span> : "—"),
        },
        {
            title: t("admin.firmapass_validations_col_status"),
            dataIndex: "estado_descripcion",
            key: "estado",
            render: (label, record) => <Tag color={ESTADO_COLOR[record.estado] || "default"}>{label || record.estado}</Tag>,
        },
        {
            title: t("admin.firmapass_validations_col_category"),
            dataIndex: "categoria_tipo_descripcion",
            key: "categoria",
            render: (value) => value || "—",
        },
        {
            title: t("admin.firmapass_validations_col_created"),
            dataIndex: "created_at",
            key: "created_at",
            defaultSortOrder: "descend",
            sorter: (a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0),
            render: (value) => (value ? new Date(value).toLocaleString() : "—"),
        },
        {
            title: "UUID",
            dataIndex: "uuid",
            key: "uuid",
            render: (uuid) => (
                <Tooltip title={t("admin.firmapass_validations_copy_uuid")}>
                    <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyUuid(uuid)}>
                        <span className="font-mono text-xs">{uuid ? `${uuid.slice(0, 8)}…` : "—"}</span>
                    </Button>
                </Tooltip>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            fixed: "right",
            render: (_, record) => (
                <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => openDetail(record.uuid)}>
                    {t("admin.firmapass_validations_view_detail")}
                </Button>
            ),
        },
    ];

    const detailCert = detailData?.current_certificate;

    return (
        <div className="p-4 sm:p-6 lg:p-8 space-y-6 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title={t("admin.firmapass_validations_title")}
                subtitle={t("admin.firmapass_validations_subtitle")}
                icon={<SafetyCertificateOutlined />}
            />

            <Alert
                className="dark-alert dark-alert-purple"
                type="info"
                showIcon
                message={t("admin.firmapass_validations_hint_title")}
                description={t("admin.firmapass_validations_hint")}
            />

            <div className="module-shell rounded-3xl p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
                    <div className="flex flex-1 flex-wrap gap-2">
                        <Input
                            allowClear
                            prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                            placeholder={t("admin.firmapass_validations_search_placeholder")}
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="max-w-xs"
                        />
                        <Select
                            allowClear
                            placeholder={t("admin.firmapass_validations_filter_status_placeholder")}
                            className="min-w-48"
                            value={statusFilter}
                            onChange={setStatusFilter}
                            options={statusOptions}
                        />
                        <Select
                            allowClear
                            placeholder={t("admin.firmapass_validations_filter_category_placeholder")}
                            className="min-w-48"
                            value={categoryFilter}
                            onChange={setCategoryFilter}
                            options={categoryOptions}
                        />
                    </div>
                    <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>
                        {t("admin.firmapass_validations_refresh")}
                    </Button>
                </div>
                <Table
                    className="module-dark-table"
                    rowKey="uuid"
                    columns={columns}
                    dataSource={filteredValidations}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{ emptyText: <Empty description={search || statusFilter || categoryFilter ? t("admin.firmapass_validations_no_matches") : t("admin.firmapass_validations_empty")} /> }}
                    scroll={{ x: true }}
                />
            </div>

            <Modal
                open={Boolean(detailUuid)}
                onCancel={closeDetail}
                footer={<Button onClick={closeDetail}>{t("admin.firmapass_validations_detail_close")}</Button>}
                title={t("admin.firmapass_validations_detail_title")}
                className="firmapass-detail-modal"
            >
                {detailLoading ? (
                    <div className="flex justify-center py-8"><Spin /></div>
                ) : detailData ? (
                    <div>
                        <DetailRow label={t("admin.firmapass_validations_col_name")} value={detailData.nombre} />
                        <DetailRow label={t("admin.firmapass_validations_col_email")} value={detailData.owner_email} />
                        <DetailRow label={t("admin.firmapass_validations_col_order")} value={detailData.order_number} />
                        <DetailRow label={t("admin.firmapass_validations_col_status")} value={<Tag color={ESTADO_COLOR[detailData.estado] || "default"}>{detailData.estado_descripcion}</Tag>} />
                        <DetailRow label={t("admin.firmapass_validations_col_category")} value={detailData.categoria_tipo_descripcion} />
                        <DetailRow label={t("admin.firmapass_validations_col_created")} value={detailData.created_at ? new Date(detailData.created_at).toLocaleString() : null} />

                        <h4 className="mb-2 mt-5 text-sm font-semibold text-[var(--ohnix-text-primary)]">
                            {t("admin.firmapass_validations_detail_cert_title")}
                        </h4>
                        {detailCert ? (
                            <div>
                                <DetailRow label={t("admin.firmapass_validations_detail_cert_identifier")} value={detailCert.identificador} />
                                <DetailRow label={t("admin.firmapass_validations_col_status")} value={<Tag color={detailCert.estado === "v" ? "green" : detailCert.estado === "r" ? "red" : "default"}>{detailCert.estado_descripcion}</Tag>} />
                                <DetailRow label={t("admin.firmapass_validations_detail_cert_algorithm")} value={detailCert.sign_alg} />
                                <DetailRow label={t("admin.firmapass_validations_detail_cert_issued")} value={detailCert.issued_at ? new Date(detailCert.issued_at).toLocaleString() : null} />
                                <DetailRow label={t("admin.firmapass_validations_detail_cert_expires")} value={detailCert.expires_at ? new Date(detailCert.expires_at).toLocaleString() : null} />
                                {detailCert.revoked_at && (
                                    <DetailRow label={t("admin.firmapass_validations_detail_cert_revoked")} value={new Date(detailCert.revoked_at).toLocaleString()} />
                                )}
                                <DetailRow label={t("admin.firmapass_validations_detail_cert_centralized")} value={detailCert.is_centralized_signature ? t("common.yes") : t("common.no")} />
                            </div>
                        ) : (
                            <Alert className="dark-alert dark-alert-amber" type="warning" showIcon message={t("admin.firmapass_validations_detail_cert_none")} />
                        )}
                    </div>
                ) : null}
            </Modal>
        </div>
    );
};

export default AdminFirmaPassValidations;
