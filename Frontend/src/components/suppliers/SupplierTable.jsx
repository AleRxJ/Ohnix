import React from "react";
import { Table, Button, Modal, Dropdown, Avatar, Tag, Card } from "antd";
import {
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    MoreOutlined,
    UserOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";

const SupplierTable = ({
    suppliers,
    loading,
    onView,
    onEdit,
    onDelete,
    isAdmin = false,
}) => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    // isAdmin here is the platform-admin "view everyone's suppliers" mode
    // (unrelated to team roles) - canEditTeam is the separate team-role gate
    // for a regular account's own suppliers.
    const canEditTeam = hasPermission("suppliers", "edit");
    const columns = [
        {
            title: t("suppliers.photo"),
            dataIndex: "photo",
            key: "photo",
            width: 80,
            render: (photo) => (
                <Avatar
                    size={40}
                    src={photo !== "default-supplier.png" ? photo : null}
                    icon={<UserOutlined />}
                />
            ),
        },
        {
            title: t("suppliers.name"),
            dataIndex: "name",
            key: "name",
            sorter: (a, b) => a.name.localeCompare(b.name),
        },
        {
            title: t("suppliers.email"),
            dataIndex: "email",
            key: "email",
        },
        {
            title: t("suppliers.phone"),
            dataIndex: "phone",
            key: "phone",
        },
        {
            title: t("suppliers.shop_name"),
            dataIndex: "shopname",
            key: "shopname",
            render: (shopname) => shopname || t("common.dash"),
        },
        {
            title: t("suppliers.type"),
            dataIndex: "type",
            key: "type",
            render: (type) => (
                <Tag color={type === "company" ? "cyan" : "green"}>
                    {(type ? t(`suppliers.${type}`) : null) || t("common.na")}
                </Tag>
            ),
        },
        {
            title: t("common.address"),
            dataIndex: "address",
            key: "address",
            ellipsis: true,
        },
        // Add Owner column for admin view
        ...(isAdmin
            ? [
                  {
                      title: t("suppliers.owner"),
                      dataIndex: ["owner", "fullName"],
                      key: "owner",
                      render: (ownerName, record) => (
                          <span>
                              {ownerName || record.owner?.username || t("common.unknown")}
                          </span>
                      ),
                  },
              ]
            : []),
        {
            title: t("common.actions"),
            key: "actions",
            width: 120,
            render: (_, record) => {
                const items = [
                    {
                        key: "view",
                        label: t("suppliers.view_details"),
                        icon: <EyeOutlined />,
                        onClick: () => onView(record),
                    },
                    // Only show edit/delete for non-admin or if user owns the supplier,
                    // and only if the team role also grants suppliers:edit.
                    ...((!isAdmin || record.canEdit) && canEditTeam
                        ? [
                              {
                                  key: "edit",
                                  label: t("common.edit"),
                                  icon: <EditOutlined />,
                                  onClick: () => onEdit(record),
                              },
                              {
                                  key: "delete",
                                  label: t("common.delete"),
                                  icon: <DeleteOutlined />,
                                  danger: true,
                                  onClick: () => {
                                      Modal.confirm({
                                          title: t("suppliers.delete_supplier"),
                                          content: t("suppliers.delete_supplier_confirm", { name: record.name }),
                                          okText: t("common.yes"),
                                          okType: "danger",
                                          cancelText: t("common.no"),
                                          onOk: () => onDelete(record._id),
                                      });
                                  },
                              },
                          ]
                        : []),
                ];

                return (
                    <Dropdown menu={{ items }} trigger={["click"]}>
                        <Button type="text" icon={<MoreOutlined />} />
                    </Dropdown>
                );
            },
        },
    ];

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] shadow-[0_16px_36px_rgba(0,0,0,0.3)]">
            <Table
                columns={columns}
                dataSource={suppliers}
                rowKey="_id"
                loading={loading}
                pagination={{
                    total: suppliers.length,
                    pageSize: 10,
                    showSizeChanger: true,
                    showQuickJumper: true,
                    showTotal: (total, range) =>
                        t("suppliers.showing_suppliers", {
                            start: range[0],
                            end: range[1],
                            total,
                        }),
                }}
                scroll={{ x: 800 }}
                className="module-dark-table"
            />
        </Card>
    );
};

export default SupplierTable;
