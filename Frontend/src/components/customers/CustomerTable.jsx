import React from "react";
import { Table, Button, Space, Popconfirm, Avatar, Tag, Empty, Tooltip, Card } from "antd";
import {
    EditOutlined,
    DeleteOutlined,
    UserOutlined,
    EyeOutlined,
    MailOutlined,
    PhoneOutlined,
    HomeOutlined,
    ShopOutlined,
} from "@ant-design/icons";
import { Typography } from "antd";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";

const { Text } = Typography;

const CustomerTable = ({ customers, loading, onEdit, onView, onDelete }) => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("customers", "edit");
    const tableShellClass = "rounded-xl shadow-sm border border-[var(--ohnix-line-4)] overflow-hidden bg-[var(--ohnix-surface-card)]";
    // Mobile card view for small screens
    const MobileCustomerCard = ({ customer }) => (
        <Card
            className="mb-4 module-shell overflow-hidden hover-lift"
            bodyStyle={{ padding: '16px' }}
        >
            <div className="flex items-start space-x-3">
                <Avatar
                    size={56}
                    src={customer.photo !== "default-customer.png" ? customer.photo : null}
                    icon={<UserOutlined />}
                    className="shadow-sm flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-2">
                        <div className="min-w-0 flex-1">
                            <Text strong className="text-base text-[var(--ohnix-text-primary)] block truncate">
                                {customer.name}
                            </Text>
                            <Tag
                                color={
                                    customer.type === 'regular' ? 'cyan' :
                                    customer.type === 'wholesale' ? 'green' : 'orange'
                                }
                                size="small"
                                className="mt-1"
                            >
                                {customer.type ? t(`customers.${customer.type}_customer`) : t("common.na")}
                            </Tag>
                        </div>
                        <Space size="small">
                            <Button type="text" icon={<EyeOutlined />} size="small" onClick={() => onView(customer)} className="text-[#44F3F0]" />
                            <Button
                                type="text"
                                icon={<EditOutlined />}
                                size="small"
                                onClick={() => onEdit(customer)}
                                className="text-[#29D8D5]"
                                disabled={!canEdit}
                            />
                            <Popconfirm
                                title={t("customers.delete_customer")}
                                description={t("customers.delete_customer_confirm")}
                                onConfirm={() => onDelete(customer._id)}
                                okText={t("common.delete")}
                                cancelText={t("common.cancel")}
                                okButtonProps={{ danger: true }}
                                disabled={!canEdit}
                            >
                                <Button
                                    type="text"
                                    icon={<DeleteOutlined />}
                                    size="small"
                                    className="text-red-400"
                                    disabled={!canEdit}
                                />
                            </Popconfirm>
                        </Space>
                    </div>
                    
                    <div className="space-y-1">
                        <div className="flex items-center text-sm text-[var(--ohnix-text-muted)]">
                            <MailOutlined className="mr-2 text-[#44F3F0] flex-shrink-0" />
                            <span className="truncate">{customer.email}</span>
                        </div>
                        <div className="flex items-center text-sm text-[var(--ohnix-text-muted)]">
                            <PhoneOutlined className="mr-2 text-[#29D8D5] flex-shrink-0" />
                            <span>{customer.phone}</span>
                        </div>
                        {customer.address && (
                            <div className="flex items-start text-sm text-[var(--ohnix-text-muted)]">
                                <HomeOutlined className="mr-2 mt-0.5 text-[#8CECEC] flex-shrink-0" />
                                <span className="truncate">{customer.address}</span>
                            </div>
                        )}
                        {customer.store_name && (
                            <div className="flex items-center text-sm text-[var(--ohnix-text-muted)]">
                                <ShopOutlined className="mr-2 text-[#FFCF70] flex-shrink-0" />
                                <span className="truncate">{customer.store_name}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );

    const columns = [
        {
            title: t("customers.customer"),
            key: "customer",
            width: 200,
            render: (_, record) => (
                <div className="flex items-center space-x-3">
                    <Avatar
                        size={48}
                        src={record.photo !== "default-customer.png" ? record.photo : null}
                        icon={<UserOutlined />}
                        className="shadow-sm"
                    />
                    <div className="min-w-0 flex-1">
                        <Text strong className="block text-[var(--ohnix-text-primary)] text-sm">
                            {record.name}
                        </Text>
                        <Tag
                            color={
                                record.type === 'regular' ? 'cyan' :
                                record.type === 'wholesale' ? 'green' : 'orange'
                            }
                            size="small"
                            className="mt-1"
                        >
                            {record.type ? t(`customers.${record.type}_customer`) : t("common.na")}
                        </Tag>
                    </div>
                </div>
            ),
        },
        {
            title: t("customers.contact_information"),
            key: "contact",
            width: 250,
            responsive: ['md'],
            render: (_, record) => (
                <div className="space-y-2">
                    <div className="flex items-center text-sm text-[var(--ohnix-text-soft)]">
                        <MailOutlined className="mr-2 text-[#44F3F0]" />
                        <Tooltip title={record.email}>
                            <span className="truncate max-w-[180px]">
                                {record.email}
                            </span>
                        </Tooltip>
                    </div>
                    <div className="flex items-center text-sm text-[var(--ohnix-text-soft)]">
                        <PhoneOutlined className="mr-2 text-[#29D8D5]" />
                        <span>{record.phone}</span>
                    </div>
                </div>
            ),
        },
        {
            title: t("customers.location_details"),
            key: "location",
            width: 220,
            responsive: ['lg'],
            render: (_, record) => (
                <div className="space-y-2">
                    {record.address && (
                        <div className="flex items-start text-sm text-[var(--ohnix-text-soft)]">
                            <HomeOutlined className="mr-2 mt-0.5 text-purple-400 flex-shrink-0" />
                            <Tooltip title={record.address}>
                                <span className="truncate max-w-[160px] leading-5">
                                    {record.address}
                                </span>
                            </Tooltip>
                        </div>
                    )}
                    {record.store_name && (
                        <div className="flex items-center text-sm text-[var(--ohnix-text-soft)]">
                            <ShopOutlined className="mr-2 text-orange-400 flex-shrink-0" />
                            <Tooltip title={record.store_name}>
                                <span className="truncate max-w-[160px]">
                                    {record.store_name}
                                </span>
                            </Tooltip>
                        </div>
                    )}
                    {!record.address && !record.store_name && (
                        <span className="text-[var(--ohnix-text-dim)] text-sm italic">{t("customers.no_location_data")}</span>
                    )}
                </div>
            ),
        },
        {
            title: t("common.actions"),
            key: "actions",
            width: 130,
            fixed: "right",
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title={t("customers.view_details")}>
                        <Button
                            type="text"
                            icon={<EyeOutlined />}
                            size="small"
                            onClick={() => onView(record)}
                            className="text-[#44F3F0] hover:text-[#44F3F0] hover:bg-[var(--ohnix-hover-overlay)]"
                        />
                    </Tooltip>
                    <Tooltip title={canEdit ? t("customers.edit_customer") : t("common.no_permission_to_edit")}>
                        <Button
                            type="text"
                            icon={<EditOutlined />}
                            size="small"
                            onClick={() => onEdit(record)}
                            className="text-[#29D8D5] hover:text-[#29D8D5] hover:bg-[var(--ohnix-hover-overlay)]"
                            disabled={!canEdit}
                        />
                    </Tooltip>
                    <Popconfirm
                        title={t("customers.delete_customer")}
                        description={t("customers.delete_customer_confirm")}
                        onConfirm={() => onDelete(record._id)}
                        okText={t("common.delete")}
                        cancelText={t("common.cancel")}
                        okButtonProps={{ danger: true }}
                        disabled={!canEdit}
                    >
                        <Tooltip title={canEdit ? t("customers.delete_customer") : t("common.no_permission_to_delete")}>
                            <Button
                                type="text"
                                icon={<DeleteOutlined />}
                                size="small"
                                className="text-red-400 hover:text-red-300 hover:bg-[var(--ohnix-hover-overlay)]"
                                disabled={!canEdit}
                            />
                        </Tooltip>
                    </Popconfirm>
                </Space>
            ),
        },
    ];

    if (loading) {
        return (
            <>
                {/* Mobile loading cards */}
                <div className="block md:hidden space-y-4">
                    {[1, 2, 3].map(i => (
                        <Card key={i} loading className="shadow-sm module-shell" />
                    ))}
                </div>
                {/* Desktop loading table */}
                <div className="hidden md:block">
                    <Table
                        columns={columns}
                        dataSource={[]}
                        loading={true}
                        pagination={false}
                        locale={{ emptyText: t("common.no_data") }}
                        className="module-dark-table"
                    />
                </div>
            </>
        );
    }

    if (customers.length === 0) {
        return (
            <div className="text-center py-12 module-shell border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)]">
                <div className="mx-auto max-w-md px-6">
                    <div className="w-16 h-16 rounded-2xl bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] flex items-center justify-center mx-auto mb-4">
                        <UserOutlined className="text-2xl text-[#44F3F0]" />
                    </div>
                    <div className="text-[var(--ohnix-text-primary)] text-lg font-semibold mb-2">
                        {t("customers.no_customers_found")}
                    </div>
                    <div className="text-[var(--ohnix-text-muted)] text-sm">
                        {t("customers.add_first_customer")}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Mobile View */}
            <div className="block md:hidden">
                <div className="space-y-0">
                    {customers.map(customer => (
                        <MobileCustomerCard key={customer._id} customer={customer} />
                    ))}
                </div>
                {customers.length > 10 && (
                    <div className="text-center mt-4 pt-4 border-t border-[var(--ohnix-line-4)] text-sm text-[var(--ohnix-text-muted)]">
                        {t("customers.showing_customers", {
                            shown: Math.min(10, customers.length),
                            total: customers.length,
                        })}
                    </div>
                )}
            </div>

            {/* Desktop View */}
            <div className="hidden md:block">
                <div className={tableShellClass}>
                    <Table
                        columns={columns}
                        dataSource={customers}
                        rowKey="_id"
                        loading={loading}
                        locale={{ emptyText: t("common.no_data") }}
                        scroll={{ x: 800 }}
                        rowClassName="transition-colors"
                        className="custom-table module-dark-table"
                        pagination={{
                            total: customers.length,
                            pageSize: 10,
                            showSizeChanger: true,
                            showQuickJumper: true,
                            showTotal: (total, range) =>
                                t("customers.showing_of_customers", {
                                    start: range[0],
                                    end: range[1],
                                    total,
                                }),
                            pageSizeOptions: ['10', '25', '50'],
                        }}
                    />
                </div>
            </div>

        </>
    );
};

export default CustomerTable;