import React, { useState } from "react";
import { Table, Button, Space, Modal, Empty, Tooltip } from "antd";
import {
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    TagsOutlined,
} from "@ant-design/icons";
import { formatDate } from "../../utils/category_units/dateUtils";
import {
    PAGINATION_CONFIG,
    TABLE_SCROLL_CONFIG,
} from "../../utils/category_units/constants";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import useIsMobile from "../../hooks/useIsMobile";

const CategoryTable = ({
    categories,
    loading,
    user,
    isAdmin,
    onEdit,
    onView,
    onDelete,
}) => {
    const [hoveredRow, setHoveredRow] = useState(null);
    const { t } = useI18n();
    const { hasPermission, hasCapability } = useTeam();
    const isMobile = useIsMobile();
    // Same reasoning as UnitTable.jsx: module-level grant, not per-record
    // "did I create this" - see the comment there.
    const canEditModule = isAdmin || hasPermission("categories", "edit");

    const columns = [
        {
            title: t("categories.category_name"),
            dataIndex: "category_name",
            key: "category_name",
            sorter: (a, b) => a.category_name.localeCompare(b.category_name),
            width: "50%",
            render: (text) => (
                <div className="flex items-center space-x-3 py-1">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
                        <TagsOutlined className="text-white text-base" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-[var(--ohnix-text-primary)] text-base leading-tight">
                            {text}
                        </span>
                        <span className="text-sm text-[var(--ohnix-text-muted)] mt-0.5">
                            {t("categories.category")}
                        </span>
                    </div>
                </div>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            width: "50%",
            align: "center",
            render: (_, record) => {
                const canEditRecord = canEditModule;
                // Deleting also needs the deleteRecords capability.
                const canDeleteRecord = canEditRecord && (isAdmin || hasCapability("deleteRecords"));

                return (
                    <div className="flex items-center justify-center space-x-2">
                        <Tooltip title={t("categories.view_details")}>
                            <Button
                                type="text"
                                size="middle"
                                icon={<EyeOutlined className="text-[#44F3F0]" />}
                                onClick={() => onView(record)}
                                className="h-9 w-9 flex items-center justify-center text-[var(--ohnix-text-soft)] hover:text-[#44F3F0] hover:bg-[var(--ohnix-hover-overlay)] border-0 rounded-lg transition-all duration-200"
                            />
                        </Tooltip>
                        <Tooltip
                            title={
                                canEditRecord ? t("common.edit") : t("common.no_permission_to_edit")
                            }
                        >
                            <Button
                                type="text"
                                size="middle"
                                icon={
                                    <EditOutlined className="text-[#29D8D5]" />
                                }
                                disabled={!canEditRecord}
                                onClick={() => onEdit(record)}
                                className={
                                    canEditRecord
                                        ? "h-9 w-9 flex items-center justify-center text-[var(--ohnix-text-soft)] hover:text-[#29D8D5] hover:bg-[var(--ohnix-hover-overlay)] border-0 rounded-lg transition-all duration-200"
                                        : "h-9 w-9 flex items-center justify-center text-gray-300 cursor-not-allowed border-0 rounded-lg"
                                }
                            />
                        </Tooltip>
                        <Tooltip
                            title={
                                canDeleteRecord
                                    ? t("common.delete")
                                        : t("common.no_permission_to_delete")
                            }
                        >
                            <Button
                                type="text"
                                size="middle"
                                icon={
                                    <DeleteOutlined className="text-red-400" />
                                }
                                disabled={!canDeleteRecord}
                                onClick={() => {
                                    Modal.confirm({
                                        title: t("categories.delete_category"),
                                        content: t("categories.delete_category_confirm"),
                                        okText: t("common.delete"),
                                        okType: "danger",
                                        cancelText: t("common.cancel"),
                                        onOk: () => onDelete(record._id),
                                    });
                                }}
                                className={
                                    canDeleteRecord
                                        ? "h-9 w-9 flex items-center justify-center text-[var(--ohnix-text-soft)] hover:text-red-300 hover:bg-[var(--ohnix-hover-overlay)] border-0 rounded-lg transition-all duration-200"
                                        : "h-9 w-9 flex items-center justify-center text-gray-300 cursor-not-allowed border-0 rounded-lg"
                                }
                            />
                        </Tooltip>
                    </div>
                );
            },
        },
    ];

    return (
        <div className="rounded-xl shadow-sm border border-[var(--ohnix-line-4)] overflow-hidden bg-[var(--ohnix-surface-card)]">
            <Table
                columns={columns}
                dataSource={categories}
                rowKey="_id"
                loading={loading}
                pagination={{
                    ...PAGINATION_CONFIG,
                    showTotal: (total, range) =>
                        t("categories.showing_categories", {
                            start: range[0],
                            end: range[1],
                            total,
                        }),
                    className: "px-6 py-4 bg-[var(--ohnix-line-1)]",
                    showSizeChanger: false,
                    size: "default",
                }}
                locale={{
                    emptyText: (
                        <div className="py-10">
                            <Empty
                                description={
                                    <div className="text-center">
                                        <div className="text-[var(--ohnix-text-muted)] text-base font-medium mb-1">
                                            {t("categories.no_categories_found")}
                                        </div>
                                        <div className="text-[var(--ohnix-text-dim)] text-sm">
                                            {t("categories.create_first_category")}
                                        </div>
                                    </div>
                                }
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            />
                        </div>
                    ),
                }}
                // Only 2 columns (name / actions), both of which flex to fit a
                // phone-width viewport natively - forcing TABLE_SCROLL_CONFIG's
                // x:600 here was making this table horizontally scrollable on
                // every screen under 600px wide for no reason (nothing in it
                // actually needs 600px).
                scroll={isMobile ? undefined : { x: 768, ...TABLE_SCROLL_CONFIG }}
                className="category-table module-dark-table"
                rowClassName={() =>
                    "hover:bg-[var(--ohnix-hover-overlay)] transition-all duration-200 cursor-pointer bg-transparent"
                }
                onRow={(record) => ({
                    onMouseEnter: () => setHoveredRow(record._id),
                    onMouseLeave: () => setHoveredRow(null),
                })}
                size="large"
            />
        </div>
    );
};

export default CategoryTable;
