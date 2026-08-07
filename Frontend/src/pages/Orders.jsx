import React, { useState } from "react";
import { Form, Button, Tooltip } from "antd";
import { PlusOutlined, ShoppingCartOutlined } from "@ant-design/icons";

import PageHeader from "../components/common/PageHeader";
import OrderStats from "../components/orders/OrderStats";
import OrderFilters from "../components/orders/OrderFilters";
import OrdersTable from "../components/orders/OrdersTable";
import CreateOrderModal from "../components/orders/CreateOrderModal";
import OrderDetailsDrawer from "../components/orders/OrderDetailsDrawer";

import { useOrders } from "../hooks/orders/useOrders";
import { useOrderOperations } from "../hooks/orders/useOrderOperations";
import useI18n from "../hooks/useI18n";
import { useTeam } from "../context/TeamContext";

const Orders = () => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("orders", "edit");
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [detailsDrawerVisible, setDetailsDrawerVisible] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [createForm] = Form.useForm();

    const {
        orders,
        customers,
        products,
        loading,
        pagination,
        filters,
        stats,
        setFilters,
        fetchOrders,
    } = useOrders();

    const {
        orderDetails,
        detailsLoading,
        updateOrderStatus,
        generateInvoice,
        createOrder,
        fetchOrderDetails,
    } = useOrderOperations(() =>
        fetchOrders(pagination.current, pagination.pageSize)
    );

    const handleTableChange = (paginationInfo) => {
        fetchOrders(paginationInfo.current, paginationInfo.pageSize);
    };

    const handleFilterChange = (key, value) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
    };

    const handleApplyFilters = () => {
        fetchOrders(1, pagination.pageSize, filters);
    };

    const handleResetFilters = () => {
        const resetFilters = {
            search: "",
            customer_id: "",
            order_status: "",
            date_range: null,
            total_range: { min: "", max: "" },
        };
        setFilters(resetFilters);
        fetchOrders(1, pagination.pageSize, resetFilters);
    };

    const handleViewDetails = (order) => {
        setSelectedOrder(order);
        setDetailsDrawerVisible(true);
        fetchOrderDetails(order._id);
    };

    const handleCreateOrder = async (values) => {
        const success = await createOrder(values, products);
        if (success) {
            setCreateModalVisible(false);
            createForm.resetFields();
        }
    };

    const handleCreateModalCancel = () => {
        setCreateModalVisible(false);
        createForm.resetFields();
    };

    return (
        <div className="min-h-screen bg-transparent text-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                <div className="space-y-6">
                    <PageHeader
                        title={t("orders.orders")}
                        subtitle={t("orders.manage_orders_description")}
                        icon={<ShoppingCartOutlined />}
                        actionButton={
                            <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                                <span className="w-full sm:w-auto inline-block">
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        onClick={() => setCreateModalVisible(true)}
                                        size="large"
                                        className="w-full min-w-[120px] sm:w-auto"
                                        disabled={!canEdit}
                                    >
                                        {t("orders.create_order")}
                                    </Button>
                                </span>
                            </Tooltip>
                        }
                    />

                    <OrderStats stats={stats} />

                    <OrderFilters
                        filters={filters}
                        customers={customers}
                        onFilterChange={handleFilterChange}
                        onApplyFilters={handleApplyFilters}
                        onResetFilters={handleResetFilters}
                    />

                    <div className="rounded-xl border border-white/10 bg-[#0B0B0B]/90 shadow-[0_16px_36px_rgba(0,0,0,0.3)]">
                        <OrdersTable
                            orders={orders}
                            loading={loading}
                            pagination={pagination}
                            onTableChange={handleTableChange}
                            onViewDetails={handleViewDetails}
                            onUpdateStatus={updateOrderStatus}
                            onGenerateInvoice={generateInvoice}
                        />
                    </div>
                </div>
            </div>

            <CreateOrderModal
                visible={createModalVisible}
                onCancel={handleCreateModalCancel}
                onSubmit={handleCreateOrder}
                customers={customers}
                products={products}
                form={createForm}
            />

            <OrderDetailsDrawer
                visible={detailsDrawerVisible}
                onClose={() => setDetailsDrawerVisible(false)}
                selectedOrder={selectedOrder}
                orderDetails={orderDetails}
                detailsLoading={detailsLoading}
                onGenerateInvoice={generateInvoice}
            />
        </div>
    );
};

export default Orders;
