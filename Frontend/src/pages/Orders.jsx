import React, { useState } from "react";
import { Form, Button, Tooltip } from "antd";
import { PlusOutlined, ShoppingCartOutlined } from "@ant-design/icons";

import PageHeader from "../components/common/PageHeader";
import OrderStats from "../components/orders/OrderStats";
import OrderFilters from "../components/orders/OrderFilters";
import OrdersTable from "../components/orders/OrdersTable";
import CreateOrderModal from "../components/orders/CreateOrderModal";
import OrderDetailsDrawer from "../components/orders/OrderDetailsDrawer";
import OrderReturnPreview from "../components/orders/OrderReturnPreview";

import { useOrders } from "../hooks/orders/useOrders";
import { useOrderOperations } from "../hooks/orders/useOrderOperations";
import useI18n from "../hooks/useI18n";
import { useTeam } from "../context/TeamContext";
import { useInventoryTour } from "../context/InventoryTourContext";
import { useDataInvalidation } from "../hooks/useDataInvalidation";

const Orders = () => {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("orders", "edit");
    const { isOpen: isTutorialActive, effectiveSteps, stepIndex, createdRefs } = useInventoryTour();
    const [createModalVisible, setCreateModalVisible] = useState(false);
    const [detailsDrawerVisible, setDetailsDrawerVisible] = useState(false);
    const [returnPreviewVisible, setReturnPreviewVisible] = useState(false);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [submitting, setSubmitting] = useState(false);
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
        returnPreviewData,
        updateOrderStatus,
        updatingOrderId,
        returnPreviewLoadingId,
        generateInvoice,
        createOrder,
        fetchOrderDetails,
        fetchReturnPreview,
        processReturn,
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

    const handleReturnPreview = async (orderId) => {
        await fetchReturnPreview(orderId);
        setReturnPreviewVisible(true);
    };

    // Same staleness gap as PurchaseList's return preview: the snapshot
    // (pending/returnable qty) was read once on open and never refreshed
    // while the modal stays open.
    useDataInvalidation(["product", "order"], () => {
        if (returnPreviewVisible && returnPreviewData?.order_id) {
            fetchReturnPreview(returnPreviewData.order_id);
        }
    });

    const handleCreateOrder = async (values) => {
        setSubmitting(true);
        try {
            const success = await createOrder(values, products);
            if (success) {
                setCreateModalVisible(false);
                createForm.resetFields();
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleCreateModalCancel = () => {
        setCreateModalVisible(false);
        createForm.resetFields();
    };

    const isTourCreateOrderStep =
        isTutorialActive && effectiveSteps[stepIndex]?.id === "create-order";
    const practiceProduct = isTourCreateOrderStep
        ? products.find((p) => p._id === createdRefs.product?.id)
        : null;
    const orderInitialValues = isTourCreateOrderStep
        ? {
              customer_id: createdRefs.customer?.id,
              order_status: "pending",
              orderItems: [
                  {
                      product_id: createdRefs.product?.id,
                      quantity: 1,
                      unitcost: practiceProduct?.selling_price ?? 15000,
                  },
              ],
          }
        : undefined;

    return (
        <div className="min-h-screen bg-transparent text-[var(--ohnix-text-primary)]">
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
                                        data-tour="tour-add-order"
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

                    <div className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] shadow-[var(--ohnix-shadow-card)]">
                        <OrdersTable
                            orders={orders}
                            loading={loading}
                            pagination={pagination}
                            onTableChange={handleTableChange}
                            onViewDetails={handleViewDetails}
                            onUpdateStatus={updateOrderStatus}
                            updatingOrderId={updatingOrderId}
                            onGenerateInvoice={generateInvoice}
                            onReturnPreview={handleReturnPreview}
                            returnPreviewLoadingId={returnPreviewLoadingId}
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
                initialValues={orderInitialValues}
                isTourCreateStep={isTourCreateOrderStep}
                submitting={submitting}
            />

            <OrderDetailsDrawer
                visible={detailsDrawerVisible}
                onClose={() => setDetailsDrawerVisible(false)}
                selectedOrder={selectedOrder}
                orderDetails={orderDetails}
                detailsLoading={detailsLoading}
                onGenerateInvoice={generateInvoice}
            />

            <OrderReturnPreview
                visible={returnPreviewVisible}
                onCancel={() => setReturnPreviewVisible(false)}
                onSubmit={processReturn}
                returnPreviewData={returnPreviewData}
                submitting={updatingOrderId === returnPreviewData?.order_id}
            />
        </div>
    );
};

export default Orders;
