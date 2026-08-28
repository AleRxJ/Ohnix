import { useContext, useEffect, useState } from "react";
import { Alert, Button, Empty, Table, Tag, Tooltip } from "antd";
import { CopyOutlined, ReloadOutlined, SafetyCertificateOutlined } from "@ant-design/icons";
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

// Alliance-wide FirmaPass validation queue (not scoped to any Ohnix
// company) - see Backend/services/firmaPassProvisioning.service.js and
// Backend/utils/firmaPassValidationScheduler.js (the email alert this page
// complements). A validation only shows up here after a client buys a
// certificate on FirmaPass's own site with iTCycle's coupon; matching one to
// an Ohnix company is a human judgment call by its `nombre` label, since
// FirmaPass exposes no email or other identifying field.
const AdminFirmaPassValidations = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const isAdmin = user?.role === "admin";

    const [loading, setLoading] = useState(true);
    const [validations, setValidations] = useState([]);

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
    ];

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
                <div className="mb-4 flex justify-end">
                    <Button icon={<ReloadOutlined />} loading={loading} onClick={fetchData}>
                        {t("admin.firmapass_validations_refresh")}
                    </Button>
                </div>
                <Table
                    rowKey="uuid"
                    columns={columns}
                    dataSource={validations}
                    loading={loading}
                    pagination={{ pageSize: 20 }}
                    locale={{ emptyText: <Empty description={t("admin.firmapass_validations_empty")} /> }}
                    scroll={{ x: true }}
                />
            </div>
        </div>
    );
};

export default AdminFirmaPassValidations;
