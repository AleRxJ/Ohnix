import React from "react";
import { Modal, Button, Typography, Tag, Divider } from "antd";
import { EditOutlined, CloseOutlined } from "@ant-design/icons";
import { formatDateTime } from "../../utils/category_units/dateUtils";
import {
    canEdit,
    getOwnershipText,
} from "../../utils/category_units/permissionUtils";
import useI18n from "../../hooks/useI18n";

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
    if (!category) return null;

    const showEditButton = canEdit(category, user, isAdmin);
    const createdByName = getOwnershipText(category, user);
    const updatedByName = category.updated_by?.username || createdByName;
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
                body: { padding: 0 },
                header: { display: "none" },
            }}
        >
            <div className="bg-[#0B0B0B] text-white">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/10">
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
                                <Title level={4} className="mb-1 !text-white">
                                    {category.category_name}
                                </Title>
                                <Tag
                                    color={isOwner ? "success" : "processing"}
                                    className="border-0 rounded-full px-3 py-1 text-xs font-medium"
                                    style={{
                                        backgroundColor: isOwner
                                            ? "rgba(41,216,213,0.12)"
                                            : "rgba(68,243,240,0.12)",
                                        color: isOwner ? "#44F3F0" : "#A9B3B8",
                                    }}
                                >
                                    {isOwner
                                        ? t("categories.your_category")
                                        : t("categories.other_users_category")}
                                </Tag>
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
                                <Text className="text-sm font-medium text-[#A9B3B8] uppercase tracking-wider">
                                    {t("categories.created_information")}
                                </Text>
                                <div className="mt-2 space-y-3">
                                    <div>
                                        <Text className="text-sm text-[#A9B3B8]">
                                            {t("categories.created_by")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base font-medium text-white">
                                                {createdByName}
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Text className="text-sm text-[#A9B3B8]">
                                            {t("categories.created_at")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base text-white">
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
                                <Text className="text-sm font-medium text-[#A9B3B8] uppercase tracking-wider">
                                    {t("categories.last_updated")}
                                </Text>
                                <div className="mt-2 space-y-3">
                                    <div>
                                        <Text className="text-sm text-[#A9B3B8]">
                                            {t("categories.updated_by")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base font-medium text-white">
                                                {updatedByName}
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Text className="text-sm text-[#A9B3B8]">
                                            {t("categories.updated_at")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base text-white">
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
                <div className="px-6 py-4 bg-white/[0.03] rounded-b-lg border-t border-white/10">
                    <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
                        <Button
                            onClick={onClose}
                            className="h-10 px-6 border-white/10 text-white hover:text-white hover:border-[#29D8D5]/35 bg-white/[0.03]"
                            style={{ borderRadius: "8px" }}
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
                                className="h-10 px-6 bg-[#29D8D5] hover:bg-[#44F3F0] border-[#29D8D5] hover:border-[#44F3F0] text-[#021314]"
                                style={{
                                    borderRadius: "8px",
                                    fontWeight: 500,
                                }}
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
