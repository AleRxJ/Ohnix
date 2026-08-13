import React, { useState } from "react";
import { Card, Space, Button, Tooltip, Badge, Form } from "antd";
import { TagsOutlined, ReloadOutlined, PlusOutlined } from "@ant-design/icons";
import CategoryTable from "./CategoryTable";
import CategoryModal from "./CategoryModal";
import CategoryViewModal from "./CategoryViewModal";
import SearchFilter from "../common/SearchFilter";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";

const CategorySection = ({ user, isAdmin, categoryHook }) => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = isAdmin || hasPermission("categories", "edit");
    const {
        categories,
        loading,
        searchText,
        setSearchText,
        filter,
        setFilter,
        loadCategories,
        createCategory,
        updateCategory,
        deleteCategory,
        clearFilters,
    } = categoryHook;

    const [modalVisible, setModalVisible] = useState(false);
    const [viewModalVisible, setViewModalVisible] = useState(false);
    const [editingCategory, setEditingCategory] = useState(null);
    const [viewingCategory, setViewingCategory] = useState(null);
    const [form] = Form.useForm();

    const handleSubmit = async (values) => {
        const result = editingCategory
            ? await updateCategory(editingCategory._id, values)
            : await createCategory(values);

        if (result?.success) {
            setModalVisible(false);
            form.resetFields();
            setEditingCategory(null);
        }
    };

    const handleEdit = (category) => {
        setEditingCategory(category);
        setModalVisible(true);
    };

    const handleView = (category) => {
        setViewingCategory(category);
        setViewModalVisible(true);
    };

    const openModal = (category = null) => {
        setEditingCategory(category);
        setModalVisible(true);
    };

    const closeModal = () => {
        setModalVisible(false);
        form.resetFields();
        setEditingCategory(null);
    };

    return (
        <div className="w-full">
            <Card
                className="shadow-sm border-0 module-shell"
                style={{
                    borderRadius: "12px",
                    background:
                        "linear-gradient(180deg, rgba(11,11,11,0.96), rgba(8,8,8,0.98))",
                    border: "1px solid var(--ohnix-line-3)",
                }}
                title={
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-[#29D8D5]/10 rounded-lg flex items-center justify-center border border-[#29D8D5]/20">
                            <TagsOutlined className="text-[#29D8D5] text-sm" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-[var(--ohnix-text-primary)] font-semibold text-base sm:text-lg">
                                {t("categories.categories")}
                            </span>
                            <Badge 
                                count={categories.length} 
                                showZero 
                                style={{ 
                                    backgroundColor: "rgba(41,216,213,0.12)",
                                    color: "#44F3F0",
                                    border: "1px solid rgba(41,216,213,0.2)"
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
                                onClick={loadCategories}
                                loading={loading}
                                className="border-[var(--ohnix-line-4)] hover:border-[#29D8D5]/35 hover:text-[var(--ohnix-text-primary)] mt-2 lg:mt-0 text-[var(--ohnix-text-primary)] bg-[var(--ohnix-line-1)]"
                                style={{ height: '36px' }}
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
                                    className="bg-[#29D8D5] hover:bg-[#44F3F0] border-[#29D8D5] hover:border-[#44F3F0] text-[#021314]"
                                    style={{
                                        height: '36px',
                                        borderRadius: '8px',
                                        fontWeight: 500
                                    }}
                                    disabled={!canEdit}
                                >
                                    <span className="hidden sm:inline">{t("categories.add_category")}</span>
                                    <span className="sm:hidden">{t("common.add")}</span>
                                </Button>
                            </span>
                        </Tooltip>
                    </div>
                }
                bodyStyle={{ padding: '20px 24px' }}
            >
                <div className="space-y-4">
                    <SearchFilter
                        searchText={searchText}
                        setSearchText={setSearchText}
                        filter={filter}
                        setFilter={setFilter}
                        onClear={clearFilters}
                        placeholder={t("categories.search_categories")}
                        isAdmin={isAdmin}
                    />

                    <div className="overflow-x-auto">
                        <CategoryTable
                            categories={categories}
                            loading={loading}
                            user={user}
                            isAdmin={isAdmin}
                            onEdit={handleEdit}
                            onView={handleView}
                            onDelete={deleteCategory}
                        />
                    </div>
                </div>
            </Card>

            <CategoryModal
                visible={modalVisible}
                onClose={closeModal}
                onSubmit={handleSubmit}
                editingCategory={editingCategory}
                form={form}
            />

            <CategoryViewModal
                visible={viewModalVisible}
                onClose={() => setViewModalVisible(false)}
                category={viewingCategory}
                user={user}
                isAdmin={isAdmin}
                onEdit={handleEdit}
            />
        </div>
    );
};

export default CategorySection;