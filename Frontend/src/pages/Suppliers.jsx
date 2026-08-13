import React, { useState } from "react";
import { Button, Tooltip } from "antd";
import { PlusOutlined, UserOutlined } from "@ant-design/icons";
import PageHeader from "../components/common/PageHeader";
import SupplierStats from "../components/suppliers/SupplierStats";
import SupplierFilters from "../components/suppliers/SupplierFilters";
import SupplierTable from "../components/suppliers/SupplierTable";
import SupplierForm from "../components/suppliers/SupplierForm";
import SupplierViewModal from "../components/suppliers/SupplierViewModal";
import { useSuppliers } from "../hooks/suppliers/useSuppliers";
import { useSupplierForm } from "../hooks/suppliers/useSupplierForm";
import { useAuth } from "../hooks/useAuth";
import useI18n from "../hooks/useI18n";
import { filterSuppliers } from "../utils/supplierUtils";
import { useTeam } from "../context/TeamContext";

const Suppliers = () => {
    const { t } = useI18n();
    // State for search and filtering
    const [searchText, setSearchText] = useState("");
    const [filterType, setFilterType] = useState("all");
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [selectedSupplier, setSelectedSupplier] = useState(null);

    // Get admin status from auth context
    const { isAdmin } = useAuth();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("suppliers", "edit");

    // Custom hooks
    const {
        suppliers,
        loading,
        stats,
        createSupplier,
        updateSupplier,
        deleteSupplier,
    } = useSuppliers(isAdmin);

    const {
        modalVisible,
        editMode,
        selectedSupplier: editingSupplier,
        form,
        fileList,
        uploadProps,
        openCreateModal,
        openEditModal,
        closeModal,
        handleSubmit,
    } = useSupplierForm();

    // Filter suppliers based on search and filter criteria
    const filteredSuppliers = filterSuppliers(
        suppliers,
        searchText,
        filterType
    );

    // Handle form submission
    const onSubmit = async (values) => {
        await handleSubmit(values, createSupplier, updateSupplier);
    };

    // Handle view supplier
    const handleView = (supplier) => {
        setSelectedSupplier(supplier);
        setViewModalVisible(true);
    };

    // Handle edit supplier
    const handleEdit = (supplier) => {
        openEditModal(supplier);
    };

    // Handle delete supplier
    const handleDelete = (id) => {
        deleteSupplier(id);
    };

    // Close view modal
    const closeViewModal = () => {
        setViewModalVisible(false);
        setSelectedSupplier(null);
    };

    return (
        <div className="p-4 sm:p-6 space-y-6 text-[var(--ohnix-text-primary)]">
            {/* Page Header */}
            <PageHeader
                title={t("suppliers.suppliers")}
                subtitle={t("suppliers.manage_suppliers_description")}
                icon={<UserOutlined />}
                actionButton={
                    <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                        <span className="w-full sm:w-auto inline-block">
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={openCreateModal}
                                size="large"
                                className="w-full min-w-[120px] sm:w-auto"
                                disabled={!canEdit}
                            >
                                {t("suppliers.add_supplier")}
                            </Button>
                        </span>
                    </Tooltip>
                }
            />

            {/* Statistics Cards */}
            <SupplierStats stats={stats} />

            {/* Search and Filter */}
            <SupplierFilters
                searchText={searchText}
                setSearchText={setSearchText}
                filterType={filterType}
                setFilterType={setFilterType}
            />

            {/* Suppliers Table */}
            <SupplierTable
                suppliers={filteredSuppliers}
                loading={loading}
                onView={handleView}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isAdmin={isAdmin}
            />

            {/* Add/Edit Modal */}
            <SupplierForm
                visible={modalVisible}
                onCancel={closeModal}
                onSubmit={onSubmit}
                form={form}
                editMode={editMode}
                editingSupplier={editingSupplier}
                fileList={fileList}
                uploadProps={uploadProps}
            />

            {/* View Modal */}
            <SupplierViewModal
                visible={viewModalVisible}
                onCancel={closeViewModal}
                supplier={selectedSupplier}
                onEdit={handleEdit}
            />
        </div>
    );
};

export default Suppliers;
