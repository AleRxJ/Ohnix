import React, { useState } from "react";
import { Table, Button, Space, Modal, Empty, Tooltip } from "antd";
import {
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    AppstoreOutlined,
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

const UnitTable = ({
    units,
    loading,
    user,
    isAdmin,
    onEdit,
    onView,
    onDelete,
}) => {
    const [hoveredRow, setHoveredRow] = useState(null);

    const columns = [
        {
            title: "Unit Name",
            dataIndex: "unit_name",
            key: "unit_name",
            sorter: (a, b) => a.unit_name.localeCompare(b.unit_name),
            width: "50%",
            render: (text) => (
                <div className="flex items-center space-x-3 py-1">
                    <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center shadow-sm">
                        <AppstoreOutlined className="text-white text-base" />
                    </div>
                    <div className="flex flex-col">
                        <span className="font-semibold text-white text-base leading-tight">
                            {text}
                        </span>
                        <span className="text-sm text-[#A9B3B8] mt-0.5">
                            Unit of Measurement
                        </span>
                    </div>
                </div>
            ),
        },
        {
            title: "Actions",
            key: "actions",
            width: "50%",
            align: "center",
            render: (_, record) => {
                const canEditRecord = canEdit(record, user, isAdmin);

                return (
                    <div className="flex items-center justify-center space-x-2">
                        <Tooltip title="View Details">
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
                                canEditRecord ? "Edit" : "No permission to edit"
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
                                    ? "Delete"
                                    : "No permission to delete"
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
                                        title: "Delete Unit",
                                        content:
                                            "Are you sure you want to delete this unit?",
                                        okText: "Delete",
                                        okType: "danger",
                                        cancelText: "Cancel",
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
                dataSource={units}
                rowKey="_id"
                loading={loading}
                pagination={{
                    ...PAGINATION_CONFIG,
                    showTotal: (total, range) =>
                        `Showing ${range[0]}-${range[1]} of ${total} units`,
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
                                            No units found
                                        </div>
                                        <div className="text-[#8B98A0] text-sm">
                                            Create your first unit to get
                                            started
                                        </div>
                                    </div>
                                }
                                image={Empty.PRESENTED_IMAGE_SIMPLE}
                            />
                        </div>
                    ),
                }}
                scroll={{ x: 768, ...TABLE_SCROLL_CONFIG }}
                className="unit-table module-dark-table"
                rowClassName={() =>
                    "hover:bg-white/[0.05] transition-all duration-200 cursor-pointer bg-transparent"
                }
                onRow={(record) => ({
                    onMouseEnter: () => setHoveredRow(record._id),
                    onMouseLeave: () => setHoveredRow(null),
                })}
                size="large"
            />
            <style jsx>{`
                .unit-table .ant-table,
                .unit-table .ant-table-container,
                .unit-table .ant-table-content,
                .unit-table .ant-table-body,
                .unit-table .ant-table-container::before,
                .unit-table .ant-table-container::after {
                    background: transparent !important;
                }
                .unit-table .ant-empty {
                    color: #a9b3b8 !important;
                }
                .unit-table .ant-empty-description,
                .unit-table .ant-empty-image {
                    color: #a9b3b8 !important;
                }
                .unit-table .ant-table {
                    font-size: 14px;
                }
                .unit-table .ant-table-thead > tr > th {
                    background: rgba(255,255,255,0.03);
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                    font-weight: 600;
                    color: #e5eef1;
                    font-size: 14px;
                    padding: 20px 24px;
                    border-top: none;
                }
                .unit-table .ant-table-thead > tr > th:first-child {
                    border-top-left-radius: 0;
                }
                .unit-table .ant-table-thead > tr > th:last-child {
                    border-top-right-radius: 0;
                }
                .unit-table .ant-table-tbody > tr > td {
                    padding: 20px 24px;
                    border-bottom: 1px solid rgba(255,255,255,0.06);
                    vertical-align: middle;
                }
                .unit-table .ant-table-tbody > tr:last-child > td {
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }
                .unit-table .ant-table-tbody > tr:hover > td {
                    background-color: rgba(68, 243, 240, 0.04) !important;
                }
                .unit-table .ant-pagination {
                    margin: 0 !important;
                    border-top: 1px solid rgba(255,255,255,0.08);
                }
                .unit-table .ant-pagination .ant-pagination-item {
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                }
                .unit-table .ant-pagination .ant-pagination-item-active {
                    background: #44F3F0;
                    border-color: #44F3F0;
                }
                .unit-table .ant-pagination .ant-pagination-item-active a {
                    color: #021314;
                }

                @media (max-width: 768px) {
                    .unit-table .ant-table-thead > tr > th,
                    .unit-table .ant-table-tbody > tr > td {
                        padding: 16px 12px;
                    }

                    .unit-table .ant-table-tbody > tr > td:first-child > div {
                        flex-direction: column;
                        align-items: flex-start;
                        space-x: 0;
                        gap: 8px;
                    }
                }

                @media (max-width: 640px) {
                    .unit-table .ant-table-thead > tr > th,
                    .unit-table .ant-table-tbody > tr > td {
                        padding: 12px 8px;
                    }

                    .unit-table .ant-pagination {
                        padding: 16px 8px;
                    }
                }
            `}</style>
        </div>
    );
};

export default UnitTable;
