import React, { useEffect, useState } from "react";
import {
    Table,
    Button,
    Space,
    Badge,
    Tooltip,
    Popconfirm,
    Image,
    Typography,
    Card,
    Tag,
} from "antd";
import {
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    ExclamationCircleOutlined,
    SwapOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { useTeam } from "../../context/TeamContext";
import useIsMobile from "../../hooks/useIsMobile";
import { DEFAULT_LOW_STOCK_THRESHOLD, PRODUCT_IMAGE_FALLBACK } from "../../utils/productUtils";

const { Text } = Typography;

const ProductsTable = ({
    products,
    loading,
    categories,
    onEdit,
    onDelete,
    onViewDetails,
    onAdjustStock,
    selectedRowKeys,
    onSelectionChange,
}) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    // Backend already rejects the mutation for a team member without
    // products:edit, but leaving Edit/Delete visibly enabled here would let
    // them fill out a whole edit form (or confirm a delete) just to hit a
    // 403 - disable + explain instead, matching Categories/Units.
    const canEdit = hasPermission("products", "edit");

    // Mobile Card View Component
    const MobileProductCard = ({ product }) => (
        <Card className="mb-3 module-shell overflow-hidden hover-lift" size="small">
            <div className="flex gap-3">
                {/* Product Image */}
                <div className="flex-shrink-0">
                    <Image
                        src={product.product_image}
                        alt={t("products.product")}
                        width={60}
                        height={60}
                        style={{ objectFit: "cover" }}
                        fallback={PRODUCT_IMAGE_FALLBACK}
                    />
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                                <Text strong className="text-sm block break-words line-clamp-2 text-[var(--ohnix-text-primary)]">
                                    {product.product_name}
                                </Text>
                                {product.is_kit && (
                                    <Tag color="#29D8D5" className="!m-0 !text-[10px] !leading-4 !px-1">
                                        {t("products.kit_badge")}
                                    </Tag>
                                )}
                                {product.tracks_batches && (
                                    <Tag color="#f59e0b" className="!m-0 !text-[10px] !leading-4 !px-1">
                                        {t("products.batch_badge")}
                                    </Tag>
                                )}
                                {product.is_manufactured && (
                                    <Tag color="#7c6af7" className="!m-0 !text-[10px] !leading-4 !px-1">
                                        {t("products.manufactured_badge")}
                                    </Tag>
                                )}
                            </div>
                            <Text className="text-xs text-[var(--ohnix-text-muted)]">
                                {t("products.product_code")}: {product.product_code}
                            </Text>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <Text className="text-[var(--ohnix-text-muted)]">{t("products.category")}</Text>
                            <br />
                            <Text className="text-[var(--ohnix-text-primary)]">{product.category_id?.category_name}</Text>
                        </div>
                        <div>
                            <Text className="text-[var(--ohnix-text-muted)]">{t("products.stock")}</Text>
                            <br />
                            <Badge
                                status={
                                    product.stock === 0
                                        ? "error"
                                        : product.stock <= (product.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD)
                                          ? "warning"
                                          : "success"
                                }
                                text={product.stock}
                            />
                            <br />
                            <Text className="text-[10px] text-[var(--ohnix-text-dim)]">
                                {t("products.threshold_column")}:{" "}
                                {product.low_stock_threshold ?? t("products.threshold_general_short")}
                            </Text>
                        </div>
                        <div>
                            <Text className="text-[var(--ohnix-text-muted)]">{t("products.selling_price")}</Text>
                            <br />
                            <Text strong className="text-[var(--ohnix-text-primary)]">
                                {formatCurrency(product.selling_price)}
                            </Text>
                        </div>
                        <div>
                            <Text className="text-[var(--ohnix-text-muted)]">{t("products.unit")}</Text>
                            <br />
                            <Text className="text-[var(--ohnix-text-primary)]">{product.unit_id?.unit_name}</Text>
                        </div>
                    </div>
                </div>
            </div>
            {/* Actions get their own row: in the title row the 4 icons left
                the name ~70px, so every product read "Producto D...". */}
            <div className="mt-3 flex justify-end gap-1 border-t border-[var(--ohnix-line-3)] pt-2">
                <Button
                    icon={<EyeOutlined />}
                    onClick={() => onViewDetails(product)}
                    type="text"
                    size="small"
                    className="text-[#44F3F0] hover:!text-[#44F3F0]"
                />
                <Tooltip title={canEdit ? t("products.adjust_stock") : t("common.no_permission_to_edit")}>
                    <Button
                        icon={<SwapOutlined />}
                        onClick={() => onAdjustStock(product)}
                        type="text"
                        size="small"
                        disabled={!canEdit}
                        className="text-[#29D8D5] hover:!text-[#29D8D5] disabled:!text-[var(--ohnix-text-dim)]"
                    />
                </Tooltip>
                <Button
                    icon={<EditOutlined />}
                    onClick={() => onEdit(product)}
                    type="text"
                    size="small"
                    disabled={!canEdit}
                    className="text-[var(--ohnix-text-muted)] hover:!text-[#44F3F0] disabled:!text-[var(--ohnix-text-dim)]"
                />
                <Popconfirm
                    title={t("products.delete_product")}
                    description={t("common.warning")}
                    onConfirm={() => onDelete(product._id)}
                    okText={t("common.yes")}
                    cancelText={t("common.no")}
                    disabled={!canEdit}
                    icon={
                        <ExclamationCircleOutlined
                            style={{ color: "red" }}
                        />
                    }
                >
                    <Button
                        icon={<DeleteOutlined />}
                        danger
                        type="text"
                        size="small"
                        disabled={!canEdit}
                    />
                </Popconfirm>
            </div>
        </Card>
    );

    const columns = [
        {
            title: t("common.image"),
            dataIndex: "product_image",
            key: "product_image",
            width: 80,
            responsive: ["md"],
            render: (image) => (
                <Image
                    src={image}
                    alt={t("products.product")}
                    width={50}
                    height={50}
                    style={{ objectFit: "cover" }}
                    fallback={PRODUCT_IMAGE_FALLBACK}
                />
            ),
        },
        {
            title: t("products.product_name"),
            dataIndex: "product_name",
            key: "product_name",
            sorter: (a, b) => a.product_name.localeCompare(b.product_name),
            render: (text, record) => (
                <div className="flex flex-col">
                    <div className="flex items-center gap-1.5">
                        <Text strong className="text-sm text-[var(--ohnix-text-primary)]">
                            {text}
                        </Text>
                        {record.is_kit && (
                            <Tag color="#29D8D5" className="!m-0 !text-[10px] !leading-4 !px-1">
                                {t("products.kit_badge")}
                            </Tag>
                        )}
                        {record.tracks_batches && (
                            <Tag color="#f59e0b" className="!m-0 !text-[10px] !leading-4 !px-1">
                                {t("products.batch_badge")}
                            </Tag>
                        )}
                        {record.is_manufactured && (
                            <Tag color="#7c6af7" className="!m-0 !text-[10px] !leading-4 !px-1">
                                {t("products.manufactured_badge")}
                            </Tag>
                        )}
                    </div>
                    <Text className="text-xs text-[var(--ohnix-text-muted)]">
                        {t("products.product_code")}: {record.product_code}
                    </Text>
                </div>
            ),
        },
        {
            title: t("products.category"),
            dataIndex: ["category_id", "category_name"],
            key: "category",
            responsive: ["lg"],
            filters: categories.map((cat) => ({
                text: cat.category_name,
                value: cat._id,
            })),
            onFilter: (value, record) => record.category_id._id === value,
        },
        {
            title: t("products.stock"),
            dataIndex: "stock",
            key: "stock",
            width: 100,
            sorter: (a, b) => a.stock - b.stock,
            render: (stock, record) => {
                let color = "success";
                let status = t("common.active");
                const threshold = record.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;

                if (stock === 0) {
                    color = "error";
                    status = t("products.out_of_stock");
                } else if (stock <= threshold) {
                    color = "warning";
                    status = t("products.low_stock");
                }

                return (
                    <div className="flex flex-col items-center">
                        <Badge status={color} />
                        <Text className="text-sm text-[var(--ohnix-text-primary)]">{stock}</Text>
                        <Text className="text-xs text-[var(--ohnix-text-muted)] hidden sm:block">
                            {status}
                        </Text>
                        <Tooltip
                            title={
                                record.low_stock_threshold != null
                                    ? t("products.low_stock_threshold_hint")
                                    : t("products.low_stock_threshold_placeholder")
                            }
                        >
                            <Text className="text-[10px] text-[var(--ohnix-text-dim)] hidden sm:block cursor-help">
                                {t("products.threshold_column")}:{" "}
                                {record.low_stock_threshold ?? t("products.threshold_general_short")}
                            </Text>
                        </Tooltip>
                    </div>
                );
            },
        },
        {
            title: t("common.price"),
            key: "price",
            render: (_, record) => (
                <div className="flex flex-col">
                    <Text strong className="text-sm text-[var(--ohnix-text-primary)]">
                        {formatCurrency(record.selling_price)}
                    </Text>
                    {/* Absent when the role can't see costs (catalogViewCosts). */}
                    {record.buying_price != null && (
                        <Text className="text-xs text-[var(--ohnix-text-muted)]">
                            {t("products.buying_price")}: {formatCurrency(record.buying_price)}
                        </Text>
                    )}
                </div>
            ),
            sorter: (a, b) => a.selling_price - b.selling_price,
        },
        {
            title: t("products.unit"),
            dataIndex: ["unit_id", "unit_name"],
            key: "unit",
            responsive: ["xl"],
        },
        {
            title: t("common.actions"),
            key: "actions",
            width: 150,
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title={t("common.info")}>
                        <Button
                            icon={<EyeOutlined />}
                            onClick={() => onViewDetails(record)}
                            type="text"
                            size="small"
                            className="text-[#44F3F0] hover:!text-[#44F3F0] hover:bg-[var(--ohnix-hover-overlay)]"
                            data-tour="tour-view-product"
                        />
                    </Tooltip>
                    <Tooltip title={canEdit ? t("products.adjust_stock") : t("common.no_permission_to_edit")}>
                        <Button
                            icon={<SwapOutlined />}
                            onClick={() => onAdjustStock(record)}
                            type="text"
                            size="small"
                            disabled={!canEdit}
                            className="text-[#29D8D5] hover:!text-[#29D8D5] hover:bg-[var(--ohnix-hover-overlay)] disabled:!text-[var(--ohnix-text-dim)]"
                            data-tour="tour-adjust-stock"
                        />
                    </Tooltip>
                    <Tooltip title={canEdit ? t("common.edit") : t("common.no_permission_to_edit")}>
                        <Button
                            icon={<EditOutlined />}
                            onClick={() => onEdit(record)}
                            type="text"
                            size="small"
                            disabled={!canEdit}
                            className="text-[var(--ohnix-text-muted)] hover:!text-[#44F3F0] hover:bg-[var(--ohnix-hover-overlay)] disabled:!text-[var(--ohnix-text-dim)]"
                        />
                    </Tooltip>
                    <Tooltip title={canEdit ? t("common.delete") : t("common.no_permission_to_delete")}>
                        <Popconfirm
                            title={t("products.delete_product")}
                            description={t("common.warning")}
                            onConfirm={() => onDelete(record._id)}
                            okText={t("common.yes")}
                            cancelText={t("common.no")}
                            disabled={!canEdit}
                            icon={
                                <ExclamationCircleOutlined
                                    style={{ color: "red" }}
                                />
                            }
                        >
                            <Button
                                icon={<DeleteOutlined />}
                                danger
                                type="text"
                                size="small"
                                disabled={!canEdit}
                            />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    const isMobile = useIsMobile();
    const MOBILE_PAGE_SIZE = 15;
    const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_PAGE_SIZE);

    // `products` is the full, unpaginated list (desktop pages it client-side
    // via the antd Table below) - rendering every card at once here used to
    // mean hundreds of Card components mounted on a phone at once for any
    // shop with a real catalog. Resets to the first page whenever the
    // underlying list changes (new search/filter/fetch), not just on mount.
    useEffect(() => {
        setMobileVisibleCount(MOBILE_PAGE_SIZE);
    }, [products]);

    if (isMobile) {
        const visibleProducts = products.slice(0, mobileVisibleCount);
        return (
            <div className="animate-fade-up">
                {loading ? (
                    <div className="text-center py-8 text-[var(--ohnix-text-muted)]">{t("common.loading")}</div>
                ) : products.length === 0 ? (
                    <div className="text-center py-8">
                        <Text className="text-[var(--ohnix-text-muted)]">
                            {t("products.no_products")}
                        </Text>
                    </div>
                ) : (
                    <>
                        {visibleProducts.map((product) => (
                            <MobileProductCard
                                key={product._id}
                                product={product}
                            />
                        ))}
                        <div className="flex flex-col items-center gap-2 pt-2 pb-1">
                            <span className="text-xs text-[var(--ohnix-text-muted)]">
                                {t("common.total")} {products.length} {t("products.products")}
                            </span>
                            {mobileVisibleCount < products.length && (
                                <Button
                                    block
                                    onClick={() => setMobileVisibleCount((c) => c + MOBILE_PAGE_SIZE)}
                                    className="max-w-xs"
                                >
                                    {t("common.load_more")}
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </div>
        );
    }

    return (
        <Table
            dataSource={products}
            columns={columns}
            rowKey="_id"
            loading={loading}
            rowSelection={
                canEdit && onSelectionChange
                    ? { selectedRowKeys, onChange: onSelectionChange }
                    : undefined
            }
            scroll={{ x: 800 }}
            pagination={{
                showSizeChanger: true,
                showTotal: (total) => `${t("common.total")} ${total} ${t("products.products")}`,
                responsive: true,
                showQuickJumper: false,
                size: "small",
            }}
            size="small"
            className="module-dark-table"
        />
    );
};

export default ProductsTable;
