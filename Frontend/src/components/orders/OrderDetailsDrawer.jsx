import { Drawer, Tag, Empty, Spin, Button, Table, Divider } from "antd";
import {
    FilePdfOutlined,
    CloseOutlined,
    ShoppingCartOutlined,
    UserOutlined,
    CalendarOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";
import { getStatusColor } from "../../utils/orderHelpers";
import { getStatusIcon } from "../../data";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";

const OrderDetailsDrawer = ({
    visible,
    onClose,
    selectedOrder,
    orderDetails,
    detailsLoading,
    onGenerateInvoice,
}) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    if (!selectedOrder) return null;

    const isCancelled = selectedOrder.order_status === "cancelled";

    const columns = [
        {
            title: t("products.product"),
            dataIndex: ["product_id", "product_name"],
            key: "product_name",
            render: (text) => (
                <div className="flex items-center space-x-2">
                    <ShoppingCartOutlined className="text-blue-500" />
                    <span className="font-medium text-gray-800">
                        {text || t("common.na")}
                    </span>
                </div>
            ),
        },
        {
            title: t("common.quantity"),
            dataIndex: "quantity",
            key: "quantity",
            align: "center",
            width: 100,
            render: (quantity) => (
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {quantity}
                </span>
            ),
        },
        {
            title: t("orders.unit_price"),
            dataIndex: "unitcost",
            key: "unitcost",
            align: "right",
            width: 120,
            render: (price) => (
                <span className="text-gray-700 font-medium">
                    {formatCurrency(price)}
                </span>
            ),
        },
        {
            title: t("common.total"),
            dataIndex: "total",
            key: "total",
            align: "right",
            width: 120,
            render: (total) => (
                <span className="text-green-600 font-semibold text-lg">
                    {formatCurrency(total)}
                </span>
            ),
        },
    ];

    return (
        <Drawer
            title={
                <div className="text-center w-full">
                    <span className="text-xl font-bold tracking-wide uppercase text-white">
                        {t("orders.order_details", { invoiceNo: selectedOrder.invoice_no })}
                    </span>
                </div>
            }
            placement="right"
            onClose={onClose}
            open={visible}
            width={520}
            closeIcon={<CloseOutlined className="text-[#A9B3B8]" />}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.45)" },
                body: {
                    padding: 24,
                    background:
                        "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
                },
                header: {
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    padding: "20px 24px",
                    background:
                        "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(8,8,8,0.98))",
                },
            }}
        >
            <div className="space-y-6">
                <div className="flex items-center justify-between pb-4 border-b border-white/10">
                    <span className="text-sm font-medium text-[#A9B3B8] uppercase tracking-wide">
                        {t("common.status")}
                    </span>
                    <Tag
                        icon={getStatusIcon(selectedOrder.order_status)}
                        color={getStatusColor(selectedOrder.order_status)}
                        className="text-sm font-medium px-3 py-1"
                    >
                        {selectedOrder.order_status.toUpperCase()}
                    </Tag>
                </div>

                <div className="grid grid-cols-2 gap-6">
                    <div>
                        <div className="flex items-center space-x-2 mb-2">
                            <UserOutlined className="text-[#8B98A0]" />
                            <span className="text-xs font-medium text-[#A9B3B8] uppercase">
                                {t("customers.customer")}
                            </span>
                        </div>
                        <p className="text-base font-semibold text-white">
                            {selectedOrder.customer_id?.name || "N/A"}
                        </p>
                    </div>
                    <div>
                        <div className="flex items-center space-x-2 mb-2">
                            <CalendarOutlined className="text-[#8B98A0]" />
                            <span className="text-xs font-medium text-[#A9B3B8] uppercase">
                                {t("orders.order_date")}
                            </span>
                        </div>
                        <p className="text-base font-semibold text-white">
                            {dayjs(selectedOrder.order_date).format(
                                "MMMM DD, YYYY"
                            )}
                        </p>
                    </div>
                </div>

                <Divider style={{ margin: "24px 0" }} />

                <div>
                    <h3 className="text-sm font-medium text-[#A9B3B8] mb-4 uppercase tracking-wide">
                        {t("orders.order_summary")}
                    </h3>
                    <div className="rounded-2xl p-4 border border-white/10 space-y-3 bg-white/[0.03] shadow-[0px_0px_20px_rgba(0,0,0,0.18)]">
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[#A9B3B8]">
                                {t("common.total_products")}
                            </span>
                            <span className="text-sm font-medium text-white">
                                {t("orders.items_count", { count: selectedOrder.total_products })}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[#A9B3B8]">
                                {t("common.subtotal")}
                            </span>
                            <span className="text-sm font-medium text-white">
                                {formatCurrency(selectedOrder.sub_total)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-[#A9B3B8]">
                                {t("orders.gst", { rate: 18 })}
                            </span>
                            <span className="text-sm font-medium text-white">
                                {formatCurrency(selectedOrder.total - selectedOrder.sub_total)}
                            </span>
                        </div>
                        <Divider style={{ margin: "12px 0", borderColor: "rgba(255,255,255,0.08)" }} />
                        <div className="flex items-center justify-between">
                            <span className="text-base font-semibold text-white">
                                {t("common.total_amount")}
                            </span>
                            <span className="text-xl font-bold text-[#44F3F0]">
                                {formatCurrency(selectedOrder.total)}
                            </span>
                        </div>
                    </div>
                </div>

                <Divider style={{ margin: "24px 0" }} />

                <div>
                    <h3 className="text-sm font-medium text-[#A9B3B8] mb-4 uppercase tracking-wide">
                        {t("orders.order_items")}
                    </h3>
                    {detailsLoading ? (
                        <div className="text-center py-12">
                            <Spin size="large" />
                            <p className="mt-4 text-[#A9B3B8] text-sm">
                                {t("common.loading")}
                            </p>
                        </div>
                    ) : orderDetails.length > 0 ? (
                        <Table
                            dataSource={orderDetails}
                            columns={columns}
                            pagination={false}
                            rowKey={(record, index) => index}
                            size="middle"
                            bordered
                        />
                    ) : (
                        <div className="py-12">
                            <Empty
                                description={
                                    <span className="text-[#A9B3B8]">
                                        {t("orders.no_items_found")}
                                    </span>
                                }
                            />
                        </div>
                    )}
                </div>

                {!isCancelled && (
                    <div className="pt-4">
                        <Button
                            type="primary"
                            icon={<FilePdfOutlined />}
                            onClick={() =>
                                onGenerateInvoice(
                                    selectedOrder._id,
                                    selectedOrder.invoice_no
                                )
                            }
                            className="w-full"
                            size="large"
                        >
                            {t("orders.download_invoice_pdf")}
                        </Button>
                    </div>
                )}
            </div>
        </Drawer>
    );
};

export default OrderDetailsDrawer;
