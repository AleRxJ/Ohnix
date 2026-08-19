import React from "react";
import { Modal, Button, Typography, Tag, Divider } from "antd";
import { EditOutlined, CloseOutlined } from "@ant-design/icons";
import { formatDateTime } from "../../utils/category_units/dateUtils";
import { getOwnershipText } from "../../utils/category_units/permissionUtils";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";

const { Title, Text } = Typography;

const CategoryViewModal = ({
    visible,
    onClose,
    category,
    user,
    isAdmin,
    onEdit,
}) => {
    const { t } = useI18n();
    const { hasPermission, team } = useTeam();
    if (!category) return null;

    // Module-level grant (Team > Roles), not "did I create this row" - see
    // the comment in CategoryTable.jsx.
    const showEditButton = isAdmin || hasPermission("categories", "edit");
    const createdByName = getOwnershipText(category);
    const updatedByName = category.updated_by?.username || createdByName;
    // "Tu categoría" vs "de otro usuario" only means something for a solo
    // account - team resources are always registered under the owner's id
    // (see getOwnershipText), so this would show "de otro usuario" on 100%
    // of records for every team member, even ones they just created
    // themselves. Hidden for any team account (owner or member), same as
    // StatsSection's showMineStats.
    const isOwner =
        (category.created_by?._id || category.created_by) === user?._id;

    return (
        <Modal
            title={null}
            open={visible}
            onCancel={onClose}
            footer={null}
            width={600}
            className="category-view-modal"
            style={{
                maxWidth: "calc(100vw - 32px)",
            }}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                    padding: 0,
                    overflow: "hidden",
                },
                body: { padding: 0 },
                header: { display: "none" },
            }}
        >
            <div className="bg-[var(--ohnix-surface)] text-[var(--ohnix-text-primary)]">
                {/* Header */}
                <div className="px-6 py-4 border-b border-[var(--ohnix-line-4)]">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] rounded-xl flex items-center justify-center">
                                <span className="text-white font-semibold text-lg">
                                    {category.category_name
                                        ?.charAt(0)
                                        ?.toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <Title level={4} className="mb-1 !text-[var(--ohnix-text-primary)]">
                                    {category.category_name}
                                </Title>
                                {!team && (
                                    <Tag
                                        color={isOwner ? "success" : "processing"}
                                        className="border-0 rounded-full px-3 py-1 text-xs font-medium"
                                        style={{
                                            backgroundColor: isOwner
                                                ? "rgba(41,216,213,0.12)"
                                                : "rgba(68,243,240,0.12)",
                                            color: isOwner ? "#44F3F0" : "var(--ohnix-text-muted)",
                                        }}
                                    >
                                        {isOwner
                                            ? t("categories.your_category")
                                            : t("categories.other_users_category")}
                                    </Tag>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Content */}
                <div className="px-6 py-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Created Information */}
                        <div className="space-y-4">
                            <div>
                                <Text className="text-sm font-medium text-[var(--ohnix-text-muted)] uppercase tracking-wider">
                                    {t("categories.created_information")}
                                </Text>
                                <div className="mt-2 space-y-3">
                                    <div>
                                        <Text className="text-sm text-[var(--ohnix-text-muted)]">
                                            {t("categories.created_by")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base font-medium text-[var(--ohnix-text-primary)]">
                                                {createdByName}
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Text className="text-sm text-[var(--ohnix-text-muted)]">
                                            {t("categories.created_at")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base text-[var(--ohnix-text-primary)]">
                                                {formatDateTime(
                                                    category.createdAt
                                                )}
                                            </Text>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Updated Information */}
                        <div className="space-y-4">
                            <div>
                                <Text className="text-sm font-medium text-[var(--ohnix-text-muted)] uppercase tracking-wider">
                                    {t("categories.last_updated")}
                                </Text>
                                <div className="mt-2 space-y-3">
                                    <div>
                                        <Text className="text-sm text-[var(--ohnix-text-muted)]">
                                            {t("categories.updated_by")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base font-medium text-[var(--ohnix-text-primary)]">
                                                {updatedByName}
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Text className="text-sm text-[var(--ohnix-text-muted)]">
                                            {t("categories.updated_at")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base text-[var(--ohnix-text-primary)]">
                                                {formatDateTime(
                                                    category.updatedAt
                                                )}
                                            </Text>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <Divider className="my-0" />

                {/* Footer Actions */}
                <div className="px-6 py-4 bg-[var(--ohnix-line-1)] rounded-b-lg border-t border-[var(--ohnix-line-4)]">
                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                        <Button
                            onClick={onClose}
                            className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                        >
                            {t("common.close")}
                        </Button>
                        {showEditButton && (
                            <Button
                                type="primary"
                                icon={<EditOutlined />}
                                onClick={() => {
                                    onClose();
                                    onEdit(category);
                                }}
                                className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                            >
                                {t("categories.edit_category")}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

        </Modal>
    );
};

export default CategoryViewModal;
