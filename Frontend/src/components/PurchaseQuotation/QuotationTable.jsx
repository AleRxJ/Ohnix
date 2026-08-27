import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { Table, Button, Space, Tag, Tooltip, Popconfirm, Card } from "antd";
import { EyeOutlined, CheckCircleOutlined, CloseCircleOutlined, ShoppingCartOutlined, TagsOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import { getQuotationStatusColor } from "../../utils/quotationUtils";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import useIsMobile from "../../hooks/useIsMobile";
import EmptyState from "../common/EmptyState";

const QuotationTable = ({
    quotations = [],
    loading = false,
    searchText = "",
    statusFilter = "all",
    onViewDetails = () => {},
    onMarkReceived = () => {},
    onReject = () => {},
    onConvert = () => {},
    updatingQuotationId = null,
}) => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("purchases", "edit");

    const filteredByText = searchText
        ? quotations.filter(
              (q) =>
                  q.quotation_no?.toLowerCase().includes(searchText.toLowerCase()) ||
                  q.supplier_id?.name?.toLowerCase().includes(searchText.toLowerCase())
          )
        : quotations;
        const filteredQuotations = statusFilter === "all"
                ? filteredByText
                : filteredByText.filter((quotation) => quotation.status === statusFilter);

    const MOBILE_PAGE_SIZE = 15;
    const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_PAGE_SIZE);
    useEffect(() => {
        setMobileVisibleCount(MOBILE_PAGE_SIZE);
    }, [quotations, searchText]);

    const renderActions = (record, size) => (
        <Space size="middle">
            <Tooltip title={t("purchases.view_details")}>
                <Button icon={<EyeOutlined />} size={size} onClick={() => onViewDetails(record)} />
            </Tooltip>
            {record.status === "draft" && (
                <Tooltip title={canEdit ? t("quotations.mark_received") : t("common.no_permission_to_edit")}>
                    <Popconfirm
                        title={t("quotations.confirm_mark_received")}
                        onConfirm={() => onMarkReceived(record._id)}
                        disabled={!canEdit}
                    >
                        <Button icon={<CheckCircleOutlined />} size={size} type="primary" disabled={!canEdit} loading={updatingQuotationId === record._id} />
                    </Popconfirm>
                </Tooltip>
            )}
            {record.status === "received" && (
                <Tooltip title={canEdit ? t("quotations.convert_to_purchase") : t("common.no_permission_to_edit")}>
                    <Button icon={<ShoppingCartOutlined />} size={size} type="primary" disabled={!canEdit} onClick={() => onConvert(record)} />
                </Tooltip>
            )}
            {["draft", "received"].includes(record.status) && (
                <Tooltip title={canEdit ? t("quotations.reject") : t("common.no_permission_to_edit")}>
                    <Popconfirm title={t("quotations.confirm_reject")} onConfirm={() => onReject(record._id)} disabled={!canEdit}>
                        <Button icon={<CloseCircleOutlined />} size={size} danger disabled={!canEdit} loading={updatingQuotationId === record._id} />
                    </Popconfirm>
                </Tooltip>
            )}
        </Space>
    );

    const MobileQuotationCard = ({ quotation }) => (
        <Card className="quotation-mobile-card mb-3 module-shell overflow-hidden hover-lift" size="small">
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#44F3F0] m-0">#{quotation.quotation_no}</p>
                    <p className="text-xs text-[var(--ohnix-text-muted)] m-0 truncate">{quotation.supplier_id?.name || t("common.na")}</p>
                </div>
                <Tag color={getQuotationStatusColor(quotation.status)} className="shrink-0">
                    {t(`quotations.status_${quotation.status}`)}
                </Tag>
            </div>
            <div className="flex items-center justify-between text-xs text-[var(--ohnix-text-muted)] mb-3">
                <span>{t("common.date")}: {dayjs(quotation.createdAt).format("DD/MM/YYYY")}</span>
                <span className="truncate">{quotation.created_by?.username || t("common.na")}</span>
            </div>
            <div className="flex gap-2">{renderActions(quotation, "middle")}</div>
        </Card>
    );

    const columns = [
        {
            title: t("quotations.quotation_no"),
            dataIndex: "quotation_no",
            key: "quotation_no",
            filteredValue: [searchText],
            onFilter: (value, record) =>
                record.quotation_no?.toLowerCase().includes(value.toLowerCase()) ||
                record.supplier_id?.name?.toLowerCase().includes(value.toLowerCase()),
        },
        {
            title: t("purchases.supplier"),
            dataIndex: ["supplier_id", "name"],
            key: "supplier",
            render: (_, record) => record.supplier_id?.name || t("common.na"),
        },
        {
            title: t("common.date"),
            dataIndex: "createdAt",
            key: "createdAt",
            render: (date) => dayjs(date).format("DD/MM/YYYY"),
        },
        {
            title: t("quotations.valid_until"),
            dataIndex: "valid_until",
            key: "valid_until",
            render: (date) => (date ? dayjs(date).format("DD/MM/YYYY") : "—"),
        },
        {
            title: t("common.status"),
            dataIndex: "status",
            key: "status",
            render: (status) => <Tag color={getQuotationStatusColor(status)}>{t(`quotations.status_${status}`)}</Tag>,
        },
        {
            title: t("common.created_by"),
            dataIndex: ["created_by", "username"],
            key: "created_by",
            render: (_, record) => record.created_by?.username || t("common.na"),
        },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, record) => renderActions(record, "small"),
        },
    ];

    const useIsMobileView = useIsMobile();

    if (useIsMobileView) {
        return (
            <div className="animate-fade-up">
                {loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : filteredQuotations.length === 0 ? (
                    <EmptyState icon={<TagsOutlined />} title={t("common.no_data")} />
                ) : (
                    <>
                        {filteredQuotations.slice(0, mobileVisibleCount).map((quotation) => (
                            <MobileQuotationCard key={quotation._id} quotation={quotation} />
                        ))}
                        {mobileVisibleCount < filteredQuotations.length && (
                            <div className="flex justify-center pt-1 pb-2">
                                <Button block onClick={() => setMobileVisibleCount((c) => c + MOBILE_PAGE_SIZE)} className="max-w-xs">
                                    {t("common.load_more")}
                                </Button>
                            </div>
                        )}
                    </>
                )}
            </div>
        );
    }

    return (
        <Table
            columns={columns}
            dataSource={quotations}
            loading={loading}
            rowKey="_id"
            locale={{ emptyText: t("common.no_data") }}
            pagination={{
                pageSize: 10,
                showSizeChanger: true,
                showQuickJumper: true,
                showTotal: (total, range) => t("quotations.showing_quotations", { start: range[0], end: range[1], total }),
            }}
            scroll={{ x: 900 }}
            className="module-dark-table"
        />
    );
};

QuotationTable.propTypes = {
    quotations: PropTypes.array,
    loading: PropTypes.bool,
    searchText: PropTypes.string,
    onViewDetails: PropTypes.func,
    onMarkReceived: PropTypes.func,
    onReject: PropTypes.func,
    onConvert: PropTypes.func,
    updatingQuotationId: PropTypes.string,
};

export default QuotationTable;
