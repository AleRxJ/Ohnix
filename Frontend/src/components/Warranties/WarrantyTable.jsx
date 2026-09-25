import { Table, Tag, Button, Card } from "antd";
import { EyeOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";
import useIsMobile from "../../hooks/useIsMobile";
import EmptyState from "../common/EmptyState";

const STATUS_COLORS = {
    registered: "blue",
    received: "geekblue",
    in_review: "gold",
    approved: "cyan",
    rejected: "red",
    in_repair: "orange",
    waiting_part: "purple",
    ready: "lime",
    delivered: "green",
    closed: "default",
};

const isOverdue = (warranty) => warranty.due_date && dayjs(warranty.due_date).isBefore(dayjs()) && !["delivered", "closed"].includes(warranty.status);

const WarrantyTable = ({ warranties = [], loading = false, pagination, onChangePage, onViewDetails = () => {}, emptyAction = null }) => {
    const { t } = useI18n();
    const isMobile = useIsMobile();

    if (!loading && warranties.length === 0) {
        return <EmptyState title={t("warranties.no_warranties")} subtitle={t("warranties.no_warranties_desc")} action={emptyAction} />;
    }

    if (isMobile) {
        return (
            <div>
                {warranties.map((warranty) => (
                    <Card key={warranty._id} className="mb-3 module-shell overflow-hidden hover-lift" size="small" onClick={() => onViewDetails(warranty)}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                                <p className="text-sm font-semibold text-[#44F3F0] m-0">{warranty.warranty_number}</p>
                                <p className="text-xs text-[var(--ohnix-text-muted)] m-0 truncate">{warranty.customer?.name || t("common.na")}</p>
                            </div>
                            <Tag color={STATUS_COLORS[warranty.status]}>{t(`warranties.status_${warranty.status}`)}</Tag>
                        </div>
                        <div className="flex items-center justify-between text-xs text-[var(--ohnix-text-muted)]">
                            <span>{warranty.product?.product_name}</span>
                            <span className={isOverdue(warranty) ? "text-[var(--ohnix-status-danger)]" : ""}>
                                {dayjs(warranty.due_date).format("DD/MM/YYYY")}
                            </span>
                        </div>
                    </Card>
                ))}
            </div>
        );
    }

    const columns = [
        { title: t("warranties.col_number"), dataIndex: "warranty_number", key: "warranty_number" },
        {
            title: t("warranties.col_customer"),
            key: "customer",
            render: (_, record) => record.customer?.name || t("common.na"),
        },
        {
            title: t("warranties.col_product"),
            key: "product",
            render: (_, record) => record.product?.product_name || t("common.na"),
        },
        { title: t("warranties.col_invoice"), dataIndex: "invoice_no", key: "invoice_no", render: (v) => v || t("common.na") },
        {
            title: t("warranties.col_status"),
            dataIndex: "status",
            key: "status",
            render: (status) => <Tag color={STATUS_COLORS[status]}>{t(`warranties.status_${status}`)}</Tag>,
        },
        {
            title: t("warranties.col_due_date"),
            dataIndex: "due_date",
            key: "due_date",
            render: (v, record) => (
                <span className={isOverdue(record) ? "text-[var(--ohnix-status-danger)] font-medium" : ""}>{dayjs(v).format("DD/MM/YYYY")}</span>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, record) => (
                <Button icon={<EyeOutlined />} onClick={() => onViewDetails(record)}>
                    {t("warranties.view_details")}
                </Button>
            ),
        },
    ];

    return (
        <Table
            className="module-dark-table"
            rowKey="_id"
            columns={columns}
            dataSource={warranties}
            loading={loading}
            pagination={{
                current: pagination?.current,
                pageSize: pagination?.pageSize,
                total: pagination?.total,
                onChange: onChangePage,
            }}
        />
    );
};

export default WarrantyTable;
