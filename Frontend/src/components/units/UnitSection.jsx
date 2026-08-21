import React, { useState } from "react";
import { Card, Space, Button, Tooltip, Badge, Form } from "antd";
import {
    AppstoreOutlined,
    ReloadOutlined,
    PlusOutlined,
} from "@ant-design/icons";
import UnitTable from "./UnitTable";
import UnitModal from "./UnitModal";
import UnitViewModal from "./UnitViewModal";
import SearchFilter from "../common/SearchFilter";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";

const UnitSection = ({ user, isAdmin, unitHook }) => {
    const { t } = useI18n();
    const { hasPermission, team } = useTeam();
    const canEdit = isAdmin || hasPermission("units", "edit");
    const {
        units,
        loading,
        searchText,
        setSearchText,
        filter,
        setFilter,
        loadUnits,
        createUnit,
        updateUnit,
        deleteUnit,
        clearFilters,
    } = unitHook;

    const [modalVisible, setModalVisible] = useState(false);
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [editingUnit, setEditingUnit] = useState(null);
    const [viewingUnit, setViewingUnit] = useState(null);
    const [submitting, setSubmitting] = useState(false);
    const [form] = Form.useForm();

    const handleSubmit = async (values) => {
        setSubmitting(true);
        try {
            // Lets the backend reject this save if someone else edited the
            // same unit after this form opened, instead of silently
            // overwriting their changes.
            const result = editingUnit
                ? await updateUnit(editingUnit._id, {
                      ...values,
                      expected_updated_at: editingUnit.updatedAt,
                  })
                : await createUnit(values);

            if (result?.success) {
                setModalVisible(false);
                form.resetFields();
                setEditingUnit(null);
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleEdit = (unit) => {
        setEditingUnit(unit);
        setModalVisible(true);
    };

    const handleView = (unit) => {
        setViewingUnit(unit);
        setViewModalVisible(true);
    };

    const openModal = (unit = null) => {
        setEditingUnit(unit);
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        form.resetFields();
        setEditingUnit(null);
    };

    return (
        <div className="w-full">
            <Card
                className="shadow-sm border-0 module-shell"
                style={{
                    borderRadius: "12px",
                    background:
                        "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-3)",
                }}
                title={
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#44F3F0]/10 rounded-lg flex items-center justify-center border border-[#44F3F0]/20">
                            <AppstoreOutlined className="text-[#44F3F0] text-sm" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[var(--ohnix-text-primary)] font-semibold text-base sm:text-lg">
                                {t("units.units")}
                            </span>
                            <Badge
                                count={units.length}
                                showZero
                                style={{
                                    backgroundColor: "rgba(68,243,240,0.12)",
                                    color: "#44F3F0",
                                    border: "1px solid rgba(68,243,240,0.2)",
                                }}
                            />
                        </div>
                    </div>
                }
                extra={
                    <div className="flex flex-col sm:flex-row gap-2">
                        <Tooltip title={t("common.refresh")}>
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={loadUnits}
                                loading={loading}
                                className="border-[var(--ohnix-line-4)] hover:border-[#44F3F0]/35 hover:text-[var(--ohnix-text-primary)] mt-2 lg:mt-0 text-[var(--ohnix-text-primary)] bg-[var(--ohnix-line-1)]"
                                style={{ height: "36px" }}
                            >
                                {t("common.refresh")}
                            </Button>
                        </Tooltip>
                        <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                            <span>
                                <Button
                                    type="primary"
                                    icon={<PlusOutlined />}
                                    onClick={() => openModal()}
                                    className="bg-[#44F3F0] hover:bg-[#29D8D5] border-[#44F3F0] hover:border-[#29D8D5] text-[#021314]"
                                    style={{
                                        height: "36px",
                                        borderRadius: "8px",
                                        fontWeight: 500,
                                    }}
                                    disabled={!canEdit}
                                    data-tour="tour-add-unit"
                                >
                                    <span className="hidden sm:inline">{t("units.add_unit")}</span>
                                    <span className="sm:hidden">{t("common.add")}</span>
                                </Button>
                            </span>
                        </Tooltip>
                    </div>
                }
                bodyStyle={{ padding: "20px 24px" }}
            >
                <div className="space-y-4">
                    <SearchFilter
                        searchText={searchText}
                        setSearchText={setSearchText}
                        filter={filter}
                        setFilter={setFilter}
                        onClear={clearFilters}
                        placeholder={t("units.search_units")}
                        isAdmin={isAdmin}
                        hasTeam={Boolean(team)}
                    />

                    <div className="overflow-x-auto">
                        <UnitTable
                            units={units}
                            loading={loading}
                            user={user}
                            isAdmin={isAdmin}
                            onEdit={handleEdit}
                            onView={handleView}
                            onDelete={deleteUnit}
                        />
                    </div>
                </div>
            </Card>

            <UnitModal
                visible={modalVisible}
                onClose={closeModal}
                onSubmit={handleSubmit}
                editingUnit={editingUnit}
                form={form}
                submitting={submitting}
            />

            <UnitViewModal
                visible={viewModalVisible}
                onClose={() => setViewModalVisible(false)}
                unit={viewingUnit}
                user={user}
                isAdmin={isAdmin}
                onEdit={handleEdit}
            />
        </div>
    );
};

export default UnitSection;
