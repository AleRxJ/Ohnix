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

const UnitViewModal = ({ visible, onClose, unit, user, isAdmin, onEdit }) => {
    const { t } = useI18n();
    if (!unit) return null;

    const showEditButton = canEdit(unit, user, isAdmin);
    const createdByName = getOwnershipText(unit, user);
    const updatedByName = unit.updated_by?.username || createdByName;
    const isOwner = (unit.created_by?._id || unit.created_by) === user?._id;

    return (
        <Modal
            title={null}
            open={visible}
            onCancel={onClose}
            footer={null}
            width={600}
            className="unit-view-modal"
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
                                    {unit.unit_name?.charAt(0)?.toUpperCase()}
                                </span>
                            </div>
                            <div>
                                <Title level={4} className="mb-1 !text-white">
                                    {unit.unit_name}
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
                                        ? t("units.your_unit")
                                        : t("units.other_users_unit")}
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
                                    {t("units.created_information")}
                                </Text>
                                <div className="mt-2 space-y-3">
                                    <div>
                                        <Text className="text-sm text-[#A9B3B8]">
                                            {t("units.created_by")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base font-medium text-white">
                                                {createdByName}
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Text className="text-sm text-[#A9B3B8]">
                                            {t("units.created_at")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base text-white">
                                                {formatDateTime(unit.createdAt)}
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
                                    {t("units.last_updated")}
                                </Text>
                                <div className="mt-2 space-y-3">
                                    <div>
                                        <Text className="text-sm text-[#A9B3B8]">
                                            {t("units.updated_by")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base font-medium text-white">
                                                {updatedByName}
                                            </Text>
                                        </div>
                                    </div>
                                    <div>
                                        <Text className="text-sm text-[#A9B3B8]">
                                            {t("units.updated_at")}
                                        </Text>
                                        <div className="mt-1">
                                            <Text className="text-base text-white">
                                                {formatDateTime(unit.updatedAt)}
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
                                    onEdit(unit);
                                }}
                                className="h-10 px-6 bg-[#44F3F0] hover:bg-[#29D8D5] border-[#44F3F0] hover:border-[#29D8D5] text-[#021314]"
                                style={{
                                    borderRadius: "8px",
                                    fontWeight: 500,
                                }}
                            >
                                {t("units.edit_unit")}
                            </Button>
                        )}
                    </div>
                </div>
            </div>

            <style jsx>{`
                .unit-view-modal .ant-modal-content {
                    border-radius: 16px;
                    overflow: hidden;
                    box-shadow:
                        0 20px 25px -5px rgb(0 0 0 / 0.1),
                        0 8px 10px -6px rgb(0 0 0 / 0.1);
                }

                @media (max-width: 768px) {
                    .unit-view-modal {
                        margin: 16px;
                    }
                    .unit-view-modal .ant-modal-content {
                        border-radius: 12px;
                    }
                }
            `}</style>
        </Modal>
    );
};

export default UnitViewModal;
