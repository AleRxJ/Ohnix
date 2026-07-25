import React from "react";
import { Card, Table, Typography, Tooltip, Badge } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import { Link as RouterLink } from "react-router-dom";

const DataTable = ({
    title,
    columns,
    dataSource,
    viewAllLink,
    loading = false,
    pagination = false,
    icon = null,
}) => {
    return (
        <Card
            title={
                <div className="flex items-center">
                    {icon && <span className="mr-2 text-primary">{icon}</span>}
                    <span className="text-base sm:text-lg font-medium truncate text-white">
                        {title}
                    </span>
                    {dataSource?.length > 0 && (
                        <Badge
                            count={dataSource.length}
                            className="ml-2 flex-shrink-0"
                            style={{
                                backgroundColor: "rgba(41,216,213,0.16)",
                                color: "#44F3F0",
                                fontWeight: "bold",
                                boxShadow: "none",
                                fontSize: "10px",
                            }}
                        />
                    )}
                </div>
            }
            extra={
                viewAllLink && (
                    <Tooltip title={`View all ${title.toLowerCase()}`}>
                        <RouterLink
                            to={viewAllLink}
                            className="flex items-center text-primary hover:text-primary-dark transition-colors text-xs sm:text-sm"
                            style={{ color: "#44F3F0" }}
                        >
                            <span className="hidden sm:inline">View All</span>
                            <span className="sm:hidden">All</span>
                            <ArrowRightOutlined className="ml-1" />
                        </RouterLink>
                    </Tooltip>
                )
            }
            className="h-full overflow-hidden rounded-lg border-0 shadow-none transition-all duration-300 flex flex-col bg-transparent"
            bodyStyle={{
                padding: 0,
                flex: 1,
                display: "flex",
                flexDirection: "column",
                minHeight: 0,
                backgroundColor: "transparent",
            }}
            headStyle={{
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                padding: "12px 16px",
                backgroundColor: "rgba(255,255,255,0.01)",
                flexShrink: 0,
            }}
        >
            <div className="flex-1 flex flex-col min-h-0">
                <Table
                    columns={columns}
                    dataSource={dataSource}
                    rowKey={(record, index) => record._id || record.id || index}
                    pagination={
                        pagination && dataSource?.length > 5
                            ? {
                                  pageSize: pagination.pageSize || 5,
                                  size: pagination.size || "small",
                                  showSizeChanger: false,
                                  className: "px-3 sm:px-6 py-2 sm:py-4",
                                  showQuickJumper: false,
                                  showTotal: (total, range) =>
                                      `${range[0]}-${range[1]} of ${total}`,
                              }
                            : false
                    }
                    size="small"
                    loading={loading}
                    locale={{
                        emptyText: (
                            <div className="py-6 sm:py-8 text-[#A9B3B8]">
                                <div className="text-sm sm:text-base">
                                    No {title.toLowerCase()} available
                                </div>
                            </div>
                        ),
                    }}
                    className="antd-custom-table flex-1"
                    scroll={{
                        x: "max-content",
                        y: pagination ? "calc(100% - 60px)" : "100%",
                    }}
                    rowClassName="transition-colors cursor-pointer"
                    style={{
                        height: "100%",
                    }}
                />
            </div>
        </Card>
    );
};

export default DataTable;
