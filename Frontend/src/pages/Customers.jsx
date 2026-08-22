import React, { useState, useEffect, useCallback } from "react";
import { Button, Input, Card, Form, Tooltip } from "antd";
import { PlusOutlined, SearchOutlined, UserOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import { api } from "../api/api";
import useI18n from "../hooks/useI18n";
import { useTeam } from "../context/TeamContext";
import { useInventoryTour } from "../context/InventoryTourContext";
import { resolveApiErrorMessage } from "../utils/apiError";
import { useDataInvalidation } from "../hooks/useDataInvalidation";
import {
    CustomerStats,
    CustomerTable,
    CustomerModal,
    CustomerViewModal,
} from "../components/customers";

const DELETE_CUSTOMER_ERROR_CODES = {
    customer_has_orders: "customers.delete_conflict_orders",
};

const SAVE_CUSTOMER_ERROR_CODES = {
    stale_edit_conflict: "common.stale_edit_conflict",
};

const Customers = () => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("customers", "edit");
    const { isOpen: isTutorialActive, notifyAction, effectiveSteps, stepIndex } = useInventoryTour();
    // State management
    const [state, setState] = useState({
        customers: [],
        loading: false,
        modalVisible: false,
        viewModalVisible: false,
        searchText: "",
        stats: { total: 0, regular: 0, wholesale: 0, retail: 0 },
    });

    const [editing, setEditing] = useState({
        customer: null,
        fileList: [],
    });

    const [viewing, setViewing] = useState({
        customer: null,
    });

    const [form] = Form.useForm();

    // Utility functions
    const updateState = (updates) => {
        setState((prev) => ({ ...prev, ...updates }));
    };

    const calculateStats = useCallback((data) => {
        const total = data.length;
        const regular = data.filter((c) => c.type === "regular").length;
        const wholesale = data.filter((c) => c.type === "wholesale").length;
        const retail = data.filter((c) => c.type === "retail").length;
        return { total, regular, wholesale, retail };
    }, []);

    // API functions
    const fetchCustomers = async () => {
        updateState({ loading: true });
        try {
            const response = await api.get("/customers");
            if (response.data.success) {
                const customers = response.data.data;
                const stats = calculateStats(customers);
                updateState({ customers, stats });
            }
        } catch (error) {
            toast.error(
                error.response?.data?.message || t("customers.failed_fetch_customers")
            );
        } finally {
            updateState({ loading: false });
        }
    };

    // Initialize component
    useEffect(() => {
        fetchCustomers();
    }, []);

    // Another connected user (or this same one, another tab) creating,
    // editing, or deleting a customer.
    useDataInvalidation("customer", fetchCustomers);

    const getFilteredCustomers = useCallback(() => {
        const { customers, searchText } = state;
        if (!searchText) return customers;

        return customers.filter((customer) => {
            const searchLower = searchText.toLowerCase();
            return (
                customer.name.toLowerCase().includes(searchLower) ||
                customer.email.toLowerCase().includes(searchLower) ||
                customer.phone.includes(searchText) ||
                (customer.store_name &&
                    customer.store_name.toLowerCase().includes(searchLower))
            );
        });
    }, [state.customers, state.searchText]);

    const handleSubmit = async (values) => {
        updateState({ loading: true });
        const wasCreate = !editing.customer;
        try {
            const formData = createFormData(values);
            const response = await submitCustomerData(formData);

            if (response.data.success) {
                toast.success(response.data.message || t("customers.operation_success"));
                await fetchCustomers();
                if (wasCreate && isTutorialActive) {
                    const created = response.data.data;
                    notifyAction("customer", created ? { id: created._id, name: created.name } : undefined);
                }
                handleCancel();
            }
        } catch (error) {
            toast.error(
                resolveApiErrorMessage(
                    error,
                    t,
                    SAVE_CUSTOMER_ERROR_CODES,
                    "customers.operation_failed"
                )
            );
        } finally {
            updateState({ loading: false });
        }
    };

    const createFormData = (values) => {
        const formData = new FormData();

        Object.keys(values).forEach((key) => {
            if (
                values[key] !== undefined &&
                values[key] !== null &&
                values[key] !== ""
            ) {
                formData.append(key, values[key]);
            }
        });

        if (editing.fileList.length > 0 && editing.fileList[0].originFileObj) {
            formData.append("photo", editing.fileList[0].originFileObj);
        }

        if (!editing.customer && isTutorialActive) {
            formData.append("is_tutorial_data", "true");
        }

        // Lets the backend reject this save if someone else edited the same
        // customer after this form opened, instead of silently overwriting
        // their changes.
        if (editing.customer?.updatedAt) {
            formData.append("expected_updated_at", editing.customer.updatedAt);
        }

        return formData;
    };

    const submitCustomerData = (formData) => {
        const config = { headers: { "Content-Type": "multipart/form-data" } };

        return editing.customer
            ? api.patch(`/customers/${editing.customer._id}`, formData, config)
            : api.post("/customers", formData, config);
    };

    const handleDelete = async (id) => {
        try {
            const response = await api.delete(`/customers/${id}`);
            if (response.data.success) {
                toast.success(t("customers.customer_deleted"));
                await fetchCustomers();
            }
        } catch (error) {
            toast.error(
                resolveApiErrorMessage(
                    error,
                    t,
                    DELETE_CUSTOMER_ERROR_CODES,
                    "customers.failed_delete_customer"
                )
            );
        }
    };

    // Modal handlers
    const handleEdit = (customer) => {
        setEditing({ customer, fileList: getExistingFileList(customer) });
        form.setFieldsValue({ ...customer });
        updateState({ modalVisible: true });
    };

    const getExistingFileList = (customer) => {
        if (customer.photo && customer.photo !== "default-customer.png") {
            return [
                {
                    uid: "-1",
                    name: "current-photo.jpg",
                    status: "done",
                    url: customer.photo,
                },
            ];
        }
        return [];
    };

    const handleView = (customer) => {
        setViewing({ customer });
        updateState({ viewModalVisible: true });
    };

    const handleCancel = () => {
        updateState({ modalVisible: false });
        setEditing({ customer: null, fileList: [] });
        form.resetFields();
    };

    const handleViewCancel = () => {
        updateState({ viewModalVisible: false });
        setViewing({ customer: null });
    };

    const handleSearch = (e) => {
        updateState({ searchText: e.target.value });
    };

    const openAddModal = () => {
        if (isTutorialActive && effectiveSteps[stepIndex]?.id === "create-customer") {
            form.setFieldsValue({
                name: t("inventory_tour.practice_customer_name"),
                email: "practica@ohnix.app",
                phone: "3000000000",
            });
        }
        updateState({ modalVisible: true });
    };

    const handleFileListChange = (update) => {
        setEditing((prev) => ({
            ...prev,
            fileList: typeof update === "function" ? update(prev.fileList) : update,
        }));
    };

    // Component render
    const filteredCustomers = getFilteredCustomers();

    return (
        <div className="p-4 sm:p-6 space-y-6 text-[var(--ohnix-text-primary)]">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-4">
                <div className="flex-1 min-w-0">
                    <h1 className="truncate mb-1 text-3xl sm:text-4xl font-bold flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                        {t("customers.manage_customers")}
                        <UserOutlined className="text-[#44F3F0] inline-block ml-2" />
                    </h1>
                    <p className="text-[var(--ohnix-text-muted)] text-base md:text-sm hidden sm:block">
                        {t("customers.manage_customers_description")}
                    </p>
                </div>
            </div>

            <CustomerStats stats={state.stats} />

            {/* Search and Add Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)] p-4 rounded-xl shadow-[0_16px_36px_rgba(0,0,0,0.3)]">
                <Input
                    placeholder={t("customers.search_customers")}
                    prefix={<SearchOutlined className="text-[var(--ohnix-text-dim)]" />}
                    value={state.searchText}
                    onChange={handleSearch}
                    className="max-w-lg"
                    size="large"
                    allowClear
                />
                <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                    <span>
                        <Button
                            type="primary"
                            icon={<PlusOutlined />}
                            onClick={openAddModal}
                            size="large"
                            className="min-w-40"
                            disabled={!canEdit}
                            data-tour="tour-add-customer"
                        >
                            {t("customers.add_customer")}
                        </Button>
                    </span>
                </Tooltip>
            </div>

            {/* Results Summary */}
            {state.searchText && (
                <div className="text-sm text-[var(--ohnix-text-soft)] bg-[#101619] border border-[#29D8D5]/25 p-3 rounded-lg">
                    {t("customers.customers_found", { count: filteredCustomers.length })}
                    {state.searchText && ` ${t("customers.matching_search", { search: state.searchText })}`}
                </div>
            )}

            {/* Customer Table */}
            <Card className="border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)] shadow-[0_16px_36px_rgba(0,0,0,0.3)]">
                <CustomerTable
                    customers={filteredCustomers}
                    loading={state.loading}
                    onEdit={handleEdit}
                    onView={handleView}
                    onDelete={handleDelete}
                />
            </Card>

            {/* Modals */}
            <CustomerViewModal
                visible={state.viewModalVisible}
                onCancel={handleViewCancel}
                customer={viewing.customer}
                onEdit={handleEdit}
            />

            <CustomerModal
                visible={state.modalVisible}
                onCancel={handleCancel}
                form={form}
                onSubmit={handleSubmit}
                loading={state.loading}
                fileList={editing.fileList}
                setFileList={handleFileListChange}
                editingCustomer={editing.customer}
            />
        </div>
    );
};

export default Customers;
