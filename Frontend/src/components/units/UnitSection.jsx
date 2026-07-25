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
import { useUnits } from "../../hooks/categories_units/useUnits";

const UnitSection = ({ user, isAdmin }) => {
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
    } = useUnits();

    const [modalVisible, setModalVisible] = useState(false);
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [editingUnit, setEditingUnit] = useState(null);
    const [viewingUnit, setViewingUnit] = useState(null);
    const [form] = Form.useForm();

    const handleSubmit = async (values) => {
        const result = editingUnit
            ? await updateUnit(editingUnit._id, values)
            : await createUnit(values);

        if (result?.success) {
            setModalVisible(false);
            form.resetFields();
            setEditingUnit(null);
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
                        "linear-gradient(180deg, rgba(11,11,11,0.96), rgba(8,8,8,0.98))",
                    border: "1px solid rgba(255,255,255,0.08)",
                }}
                title={
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#44F3F0]/10 rounded-lg flex items-center justify-center border border-[#44F3F0]/20">
                            <AppstoreOutlined className="text-[#44F3F0] text-sm" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-white font-semibold text-base sm:text-lg">
                                Units
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
                        <Tooltip title="Refresh">
                            <Button
                                icon={<ReloadOutlined />}
                                onClick={loadUnits}
                                loading={loading}
                                className="border-white/10 hover:border-[#44F3F0]/35 hover:text-white mt-2 lg:mt-0 text-white bg-white/[0.03]"
                                style={{ height: "36px" }}
                            >
                                Refresh
                            </Button>
                        </Tooltip>
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
                        >
                            <span className="hidden sm:inline">Add Unit</span>
                            <span className="sm:hidden">Add</span>
                        </Button>
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
                        placeholder="Search units..."
                        isAdmin={isAdmin}
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
