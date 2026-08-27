import React, { useEffect, useState } from "react";
import { Table, Button, Modal, Dropdown, Avatar, Tag, Card } from "antd";
import {
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    MoreOutlined,
    UserOutlined,
    SwapOutlined,
    MailOutlined,
    PhoneOutlined,
    ShopOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import useIsMobile from "../../hooks/useIsMobile";
import EmptyState from "../common/EmptyState";

const SupplierTable = ({
    suppliers,
    loading,
    onView,
    onEdit,
    onDelete,
    onMove,
    canMove = false,
    isAdmin = false,
}) => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const isMobile = useIsMobile();
    // isAdmin here is the platform-admin "view everyone's suppliers" mode
    // (unrelated to team roles) - canEditTeam is the separate team-role gate
    // for a regular account's own suppliers.
    const canEditTeam = hasPermission("suppliers", "edit");

    // Shared between the desktop table's action column and the mobile card's
    // "More" dropdown so the visibility rules (admin-view ownership, team
    // edit permission, move-between-locations) only live in one place.
    const getActionItems = (record) => [
        {
            key: "view",
            label: t("suppliers.view_details"),
            icon: <EyeOutlined />,
            onClick: () => onView(record),
        },
        ...((!isAdmin || record.canEdit) && canEditTeam
            ? [
                  {
                      key: "edit",
                      label: t("common.edit"),
                      icon: <EditOutlined />,
                      onClick: () => onEdit(record),
                  },
                  ...(canMove
                      ? [
                            {
                                key: "move",
                                label: t("pointOfSale.move_action"),
                                icon: <SwapOutlined />,
                                onClick: () => onMove(record),
                            },
                        ]
                      : []),
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

    const MOBILE_PAGE_SIZE = 15;
    const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_PAGE_SIZE);
    useEffect(() => {
        setMobileVisibleCount(MOBILE_PAGE_SIZE);
    }, [suppliers]);

    const MobileSupplierCard = ({ supplier }) => (
        <Card className="mb-3 module-shell overflow-hidden hover-lift" bodyStyle={{ padding: 14 }}>
            <div className="flex items-start gap-3">
                <Avatar
                    size={48}
                    src={supplier.photo !== "default-supplier.png" ? supplier.photo : null}
                    icon={<UserOutlined />}
                    className="shrink-0"
                />
                <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                            <p className="text-sm font-semibold text-[var(--ohnix-text-primary)] m-0 truncate">{supplier.name}</p>
                            <Tag color={supplier.type === "company" ? "cyan" : "green"} className="mt-1">
                                {(supplier.type ? t(`suppliers.${supplier.type}`) : null) || t("common.na")}
                            </Tag>
                        </div>
                        <Dropdown menu={{ items: getActionItems(supplier) }} trigger={["click"]}>
                            <Button type="text" icon={<MoreOutlined />} className="shrink-0" />
                        </Dropdown>
                    </div>
                    <div className="space-y-1 text-sm text-[var(--ohnix-text-muted)]">
                        {supplier.email && (
                            <div className="flex items-center gap-2">
                                <MailOutlined className="text-[#44F3F0] shrink-0" />
                                <span className="truncate">{supplier.email}</span>
                            </div>
                        )}
                        {supplier.phone && (
                            <div className="flex items-center gap-2">
                                <PhoneOutlined className="text-[#29D8D5] shrink-0" />
                                <span>{supplier.phone}</span>
                            </div>
                        )}
                        {supplier.shopname && (
                            <div className="flex items-center gap-2">
                                <ShopOutlined className="text-[#FFCF70] shrink-0" />
                                <span className="truncate">{supplier.shopname}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );

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
            render: (_, record) => (
                <Dropdown menu={{ items: getActionItems(record) }} trigger={["click"]}>
                    <Button type="text" icon={<MoreOutlined />} />
                </Dropdown>
            ),
        },
    ];

    if (isMobile) {
        const visibleSuppliers = suppliers.slice(0, mobileVisibleCount);
        return (
            <div className="animate-fade-up">
                {loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : suppliers.length === 0 ? (
                    <EmptyState icon={<UserOutlined />} title={t("suppliers.no_suppliers")} />
                ) : (
                    <>
                        {visibleSuppliers.map((supplier) => (
                            <MobileSupplierCard key={supplier._id} supplier={supplier} />
                        ))}
                        <div className="flex flex-col items-center gap-2 pt-2 pb-1">
                            <span className="text-xs text-[var(--ohnix-text-muted)]">
                                {t("common.total")} {suppliers.length}
                            </span>
                            {mobileVisibleCount < suppliers.length && (
                                <Button block onClick={() => setMobileVisibleCount((c) => c + MOBILE_PAGE_SIZE)} className="max-w-xs">
                                    {t("common.load_more")}
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    }

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
