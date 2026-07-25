import React from "react";
import { Drawer, Image, Typography, Divider } from "antd";
import {
    TagOutlined,
    InboxOutlined,
    DollarOutlined,
    CalendarOutlined,
    AppstoreOutlined,
    CheckCircleOutlined,
    WarningOutlined,
    CloseCircleOutlined,
    PercentageOutlined,
} from "@ant-design/icons";
import { useCurrency } from "../../context/CurrencyContext";

const { Text, Title } = Typography;

const ProductDetailsDrawer = ({
    visible,
    product,
    onClose,
    placement = "right",
    width,
    height,
}) => {
    if (!product) return null;
    const { formatCurrency } = useCurrency();

    const getStockStatus = (stock) => {
        if (stock === 0) {
            return {
                text: "Out of Stock",
                color: "#ef4444",
                bg: "rgba(239,68,68,0.12)",
                border: "rgba(239,68,68,0.25)",
                icon: <CloseCircleOutlined />,
            };
        }

        if (stock <= 10) {
            return {
                text: "Low Stock",
                color: "#f59e0b",
                bg: "rgba(245,158,11,0.12)",
                border: "rgba(245,158,11,0.25)",
                icon: <WarningOutlined />,
            };
        }

        return {
            text: "In Stock",
            color: "#29D8D5",
            bg: "rgba(41,216,213,0.12)",
            border: "rgba(41,216,213,0.25)",
            icon: <CheckCircleOutlined />,
        };
    };

    const stockStatus = getStockStatus(product.stock);
    const profitMargin = (product.selling_price - product.buying_price)?.toFixed(2);
    const profitPercentage =
        product.selling_price > 0
            ? (
                  ((product.selling_price - product.buying_price) /
                      product.selling_price) *
                  100
              ).toFixed(1)
            : 0;

    const drawerWidth =
        width || (typeof window !== "undefined" && window.innerWidth < 768 ? "100vw" : "480px");

    return (
        <Drawer
            title={
                <div className="flex items-center justify-between">
                    <Text className="text-lg font-bold text-white">Product Details</Text>
                </div>
            }
            placement={placement}
            onClose={onClose}
            open={visible}
            width={drawerWidth}
            height={height}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.45)" },
                header: {
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    padding: "20px 24px",
                    background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(8,8,8,0.98))",
                },
                body: {
                    padding: "24px",
                    background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
                },
            }}
        >
            <div className="space-y-5">
                <div className="module-shell rounded-3xl p-5 reveal-card">
                    <div className="flex gap-5">
                        <div className="flex-shrink-0">
                            <div className="w-28 h-full rounded-lg overflow-hidden bg-white/[0.04] border border-white/10 flex items-center justify-center">
                                <Image
                                    src={product.product_image}
                                    alt={product.product_name}
                                    className="w-full h-full object-cover"
                                    fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6U"
                                    preview={{
                                        mask: <div className="text-white text-xs font-medium">Preview</div>,
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex-1 min-w-0">
                            <Title level={4} className="!text-white !mb-2 !text-lg !font-semibold">
                                {product.product_name}
                            </Title>
                            <div className="flex items-center gap-2 mb-3">
                                <TagOutlined className="text-[#8B98A0] text-xs" />
                                <Text className="text-sm text-[#A9B3B8]">{product.product_code}</Text>
                            </div>
                            <div
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border"
                                style={{
                                    backgroundColor: stockStatus.bg,
                                    color: stockStatus.color,
                                    borderColor: stockStatus.border,
                                }}
                            >
                                {stockStatus.icon}
                                <span>{stockStatus.text}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-3 gap-3">
                    <div className="module-shell rounded-3xl p-4">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-10 h-10 rounded-lg bg-[#29D8D5]/10 flex items-center justify-center mb-2">
                                <InboxOutlined className="text-[#29D8D5] text-lg" />
                            </div>
                            <Text className="text-xs text-[#A9B3B8] mb-1 font-bold">Stock</Text>
                            <Text className="text-xl font-bold text-white">{product.stock}</Text>
                        </div>
                    </div>

                    <div className="module-shell rounded-3xl p-4">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-10 h-10 rounded-lg bg-[#44F3F0]/10 flex items-center justify-center mb-2">
                                <DollarOutlined className="text-[#44F3F0] text-lg" />
                            </div>
                            <Text className="text-xs text-[#A9B3B8] mb-1 font-bold">Profit</Text>
                            <Text className="text-xl font-bold text-[#44F3F0]">{formatCurrency(Number(profitMargin))}</Text>
                        </div>
                    </div>

                    <div className="module-shell rounded-3xl p-4">
                        <div className="flex flex-col items-center text-center">
                            <div className="w-10 h-10 rounded-lg bg-[#29D8D5]/10 flex items-center justify-center mb-2">
                                <PercentageOutlined className="text-[#29D8D5] text-lg" />
                            </div>
                            <Text className="text-xs text-[#A9B3B8] mb-1 font-bold">Margin</Text>
                            <Text className="text-xl font-bold text-white">{profitPercentage}%</Text>
                        </div>
                    </div>
                </div>

                <div className="module-shell rounded-3xl border border-white/10">
                    <div className="px-5 py-4 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <DollarOutlined className="text-[#29D8D5]" />
                            <Text className="text-sm font-bold text-white">Pricing Information</Text>
                        </div>
                    </div>
                    <div className="p-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[#A9B3B8]">Buying Price</Text>
                                <Text className="text-base font-semibold text-white">
                                    {formatCurrency(product.buying_price)}
                                </Text>
                            </div>
                            <Divider className="!my-0" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[#A9B3B8]">Selling Price</Text>
                                <Text className="text-base font-semibold text-[#44F3F0]">
                                    {formatCurrency(product.selling_price)}
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="module-shell rounded-3xl border border-white/10">
                    <div className="px-5 py-4 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <AppstoreOutlined className="text-[#29D8D5]" />
                            <Text className="text-sm font-bold text-white">Product Classification</Text>
                        </div>
                    </div>
                    <div className="p-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[#A9B3B8]">Category</Text>
                                <Text className="text-sm font-medium text-white">
                                    {product.category_id?.category_name || "N/A"}
                                </Text>
                            </div>
                            <Divider className="!my-0" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[#A9B3B8]">Unit</Text>
                                <Text className="text-sm font-medium text-white">
                                    {product.unit_id?.unit_name || "N/A"}
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="module-shell rounded-3xl border border-white/10">
                    <div className="px-5 py-4 border-b border-white/10">
                        <div className="flex items-center gap-2">
                            <CalendarOutlined className="text-[#29D8D5]" />
                            <Text className="text-sm font-bold text-white">Product Timeline</Text>
                        </div>
                    </div>
                    <div className="p-5">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[#A9B3B8]">Created</Text>
                                <Text className="text-sm font-medium text-white">
                                    {new Date(product.createdAt).toLocaleDateString("en-US", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </Text>
                            </div>
                            <Divider className="!my-0" style={{ borderColor: "rgba(255,255,255,0.08)" }} />
                            <div className="flex items-center justify-between">
                                <Text className="text-sm text-[#A9B3B8]">Last Updated</Text>
                                <Text className="text-sm font-medium text-white">
                                    {new Date(product.updatedAt).toLocaleDateString("en-US", {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric",
                                    })}
                                </Text>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Drawer>
    );
};

export default ProductDetailsDrawer;
