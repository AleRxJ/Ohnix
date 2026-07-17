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
                        <span className="font-semibold text-gray-900 text-base leading-tight">
                            {text}
                        </span>
                        <span className="text-sm text-gray-500 mt-0.5">
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
                                icon={<EyeOutlined className="text-blue-600" />}
                                onClick={() => onView(record)}
                                className="h-9 w-9 flex items-center justify-center text-gray-600 hover:text-blue-600 hover:bg-blue-50 border-0 rounded-lg transition-all duration-200"
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
                                    <EditOutlined className="text-emerald-600" />
                                }
                                disabled={!canEditRecord}
                                onClick={() => onEdit(record)}
                                className={
                                    canEditRecord
                                        ? "h-9 w-9 flex items-center justify-center text-gray-600 hover:text-emerald-600 hover:bg-emerald-50 border-0 rounded-lg transition-all duration-200"
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
                                    <DeleteOutlined className="text-red-600" />
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
                                        ? "h-9 w-9 flex items-center justify-center text-gray-600 hover:text-red-600 hover:bg-red-50 border-0 rounded-lg transition-all duration-200"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                    className: "px-6 py-4 bg-gray-50/50",
                    showSizeChanger: false,
                    size: "default",
                }}
                locale={{
                    emptyText: (
                        <div className="py-10">
                            <Empty
                                description={
                                    <div className="text-center">
                                        <div className="text-gray-500 text-base font-medium mb-1">
                                            {t("categories.no_categories_found")}
                                        </div>
                                        <div className="text-gray-400 text-sm">
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
                className="category-table"
                rowClassName={(record, index) =>
                    `hover:bg-blue-50/30 transition-all duration-200 cursor-pointer ${
                        index % 2 === 0 ? "bg-white" : "bg-gray-50/30"
                    }`
                }
                onRow={(record) => ({
                    onMouseEnter: () => setHoveredRow(record._id),
                    onMouseLeave: () => setHoveredRow(null),
                })}
                size="large"
            />
            <style jsx>{`
                .category-table .ant-table {
                    font-size: 14px;
                }
                .category-table .ant-table-thead > tr > th {
                    background: linear-gradient(
                        135deg,
                        #f8fafc 0%,
                        #f1f5f9 100%
                    );
                    border-bottom: 2px solid #e2e8f0;
                    font-weight: 600;
                    color: #334155;
                    font-size: 14px;
                    padding: 20px 24px;
                    border-top: none;
                }
                .category-table .ant-table-thead > tr > th:first-child {
                    border-top-left-radius: 0;
                }
                .category-table .ant-table-thead > tr > th:last-child {
                    border-top-right-radius: 0;
                }
                .category-table .ant-table-tbody > tr > td {
                    padding: 20px 24px;
                    border-bottom: 1px solid #f1f5f9;
                    vertical-align: middle;
                }
                .category-table .ant-table-tbody > tr:last-child > td {
                    border-bottom: 1px solid #e2e8f0;
                }
                .category-table .ant-table-tbody > tr:hover > td {
                    background-color: rgba(59, 130, 246, 0.04) !important;
                }
                .category-table .ant-pagination {
                    margin: 0 !important;
                    border-top: 1px solid #e2e8f0;
                }
                .category-table .ant-pagination .ant-pagination-item {
                    border-radius: 8px;
                    border: 1px solid #e2e8f0;
                }
                .category-table .ant-pagination .ant-pagination-item-active {
                    background: #3b82f6;
                    border-color: #3b82f6;
                }
                .category-table .ant-pagination .ant-pagination-item-active a {
                    color: white;
                }

                @media (max-width: 768px) {
                    .category-table .ant-table-thead > tr > th,
                    .category-table .ant-table-tbody > tr > td {
                        padding: 16px 12px;
                    }

                    .category-table
                        .ant-table-tbody
                        > tr
                        > td:first-child
                        > div {
                        flex-direction: column;
                        align-items: flex-start;
                        space-x: 0;
                        gap: 8px;
                    }
                }

                @media (max-width: 640px) {
                    .category-table .ant-table-thead > tr > th,
                    .category-table .ant-table-tbody > tr > td {
                        padding: 12px 8px;
                    }

                    .category-table .ant-pagination {
                        padding: 16px 8px;
                    }
                }
            `}</style>
        </div>
    );
};

export default CategoryTable;
