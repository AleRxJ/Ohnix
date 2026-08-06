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
    canEdit,
    getOwnershipTag,
    getOwnershipText,
} from "../../utils/category_units/permissionUtils";
import {
    PAGINATION_CONFIG,
    TABLE_SCROLL_CONFIG,
} from "../../utils/category_units/constants";
import useI18n from "../../hooks/useI18n";

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
                        <span className="font-semibold text-white text-base leading-tight">
                            {text}
                        </span>
                        <span className="text-sm text-[#A9B3B8] mt-0.5">
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
                const canEditRecord = canEdit(record, user, isAdmin);

                return (
                    <div className="flex items-center justify-center space-x-2">
                        <Tooltip title={t("categories.view_details")}>
                            <Button
                                type="text"
                                size="middle"
                                icon={<EyeOutlined className="text-[#44F3F0]" />}
                                onClick={() => onView(record)}
                                className="h-9 w-9 flex items-center justify-center text-[#D4DBDF] hover:text-[#44F3F0] hover:bg-white/5 border-0 rounded-lg transition-all duration-200"
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
                                        ? "h-9 w-9 flex items-center justify-center text-[#D4DBDF] hover:text-[#29D8D5] hover:bg-white/5 border-0 rounded-lg transition-all duration-200"
                                        : "h-9 w-9 flex items-center justify-center text-gray-300 cursor-not-allowed border-0 rounded-lg"
                                }
                            />
                        </Tooltip>
                        <Tooltip
                            title={
                                canEditRecord
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
                                disabled={!canEditRecord}
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
                                    canEditRecord
                                        ? "h-9 w-9 flex items-center justify-center text-[#D4DBDF] hover:text-red-300 hover:bg-white/5 border-0 rounded-lg transition-all duration-200"
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
        <div className="rounded-xl shadow-sm border border-white/10 overflow-hidden bg-[#0B0B0B]/92">
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
                    className: "px-6 py-4 bg-white/[0.03]",
                    showSizeChanger: false,
                    size: "default",
                }}
                locale={{
                    emptyText: (
                        <div className="py-10">
                            <Empty
                                description={
                                    <div className="text-center">
                                        <div className="text-[#A9B3B8] text-base font-medium mb-1">
                                            {t("categories.no_categories_found")}
                                        </div>
                                        <div className="text-[#8B98A0] text-sm">
                                            {t("categories.create_first_category")}
                                        </div>
                                    </div>
                                }
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            />
                        </div>
                    ),
                }}
                scroll={{ x: 768, ...TABLE_SCROLL_CONFIG }}
                className="category-table module-dark-table"
                rowClassName={() =>
                    "hover:bg-white/[0.05] transition-all duration-200 cursor-pointer bg-transparent"
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
