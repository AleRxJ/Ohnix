import React from "react";
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
} from "antd";
import {
    EditOutlined,
    DeleteOutlined,
    EyeOutlined,
    ExclamationCircleOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

const ProductsTable = ({
    products,
    loading,
    categories,
    onEdit,
    onDelete,
    onViewDetails,
}) => {
    const { t } = useI18n();

    // Mobile Card View Component
    const MobileProductCard = ({ product }) => (
        <Card className="mb-3" size="small">
            <div className="flex gap-3">
                {/* Product Image */}
                <div className="flex-shrink-0">
                    <Image
                        src={product.product_image}
                        alt={t("products.product")}
                        width={60}
                        height={60}
                        style={{ objectFit: "cover" }}
                        fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6U"
                    />
                </div>

                {/* Product Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 min-w-0">
                            <Text strong className="text-sm block truncate">
                                {product.product_name}
                            </Text>
                            <Text type="secondary" className="text-xs">
                                {t("products.product_code")}: {product.product_code}
                            </Text>
                        </div>
                        <div className="flex gap-1 ml-2">
                            <Button
                                icon={<EyeOutlined />}
                                onClick={() => onViewDetails(product)}
                                type="text"
                                size="small"
                            />
                            <Button
                                icon={<EditOutlined />}
                                onClick={() => onEdit(product)}
                                type="text"
                                size="small"
                            />
                            <Popconfirm
                                title={t("products.delete_product")}
                                description={t("common.warning")}
                                onConfirm={() => onDelete(product._id)}
                                okText={t("common.yes")}
                                cancelText={t("common.no")}
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
                                />
                            </Popconfirm>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                            <Text type="secondary">{t("products.category")}</Text>
                            <br />
                            <Text>{product.category_id?.category_name}</Text>
                        </div>
                        <div>
                            <Text type="secondary">{t("products.stock")}</Text>
                            <br />
                            <Badge
                                status={
                                    product.stock === 0
                                        ? "error"
                                        : product.stock <= 10
                                          ? "warning"
                                          : "success"
                                }
                                text={product.stock}
                            />
                        </div>
                        <div>
                            <Text type="secondary">{t("products.selling_price")}</Text>
                            <br />
                            <Text strong>
                                ₹{product.selling_price.toFixed(2)}
                            </Text>
                        </div>
                        <div>
                            <Text type="secondary">{t("products.unit")}</Text>
                            <br />
                            <Text>{product.unit_id?.unit_name}</Text>
                        </div>
                    </div>
                </div>
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
                    fallback="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAMIAAADDCAYAAADQvc6U"
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
                    <Text strong className="text-sm">
                        {text}
                    </Text>
                    <Text type="secondary" className="text-xs">
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
            render: (stock) => {
                let color = "success";
                let status = t("common.active");

                if (stock === 0) {
                    color = "error";
                    status = t("products.out_of_stock");
                } else if (stock <= 10) {
                    color = "warning";
                    status = t("products.low_stock");
                }

                return (
                    <div className="flex flex-col items-center">
                        <Badge status={color} />
                        <Text className="text-sm">{stock}</Text>
                        <Text
                            type="secondary"
                            className="text-xs hidden sm:block"
                        >
                            {status}
                        </Text>
                    </div>
                );
            },
        },
        {
            title: t("common.price"),
            key: "price",
            render: (_, record) => (
                <div className="flex flex-col">
                    <Text strong className="text-sm">
                        ₹ {record.selling_price.toFixed(2)}
                    </Text>
                    <Text type="secondary" className="text-xs">
                        {t("products.buying_price")}: ₹{record.buying_price.toFixed(2)}
                    </Text>
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
            width: 120,
            render: (_, record) => (
                <Space size="small">
                    <Tooltip title={t("common.info")}>
                        <Button
                            icon={<EyeOutlined />}
                            onClick={() => onViewDetails(record)}
                            type="text"
                            size="small"
                        />
                    </Tooltip>
                    <Tooltip title={t("common.edit")}>
                        <Button
                            icon={<EditOutlined />}
                            onClick={() => onEdit(record)}
                            type="text"
                            size="small"
                        />
                    </Tooltip>
                    <Tooltip title={t("common.delete")}>
                        <Popconfirm
                            title={t("products.delete_product")}
                            description={t("common.warning")}
                            onConfirm={() => onDelete(record._id)}
                            okText={t("common.yes")}
                            cancelText={t("common.no")}
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
                            />
                        </Popconfirm>
                    </Tooltip>
                </Space>
            ),
        },
    ];

    // Check if screen is mobile (you can adjust breakpoint as needed)
    const isMobile = window.innerWidth < 768;

    if (isMobile) {
        return (
            <div>
                {loading ? (
                    <div className="text-center py-8">{t("common.loading")}</div>
                ) : products.length === 0 ? (
                    <div className="text-center py-8">
                        <Text type="secondary">
                            {t("products.no_products")}
                        </Text>
                    </div>
                ) : (
                    products.map((product) => (
                        <MobileProductCard
                            key={product._id}
                            product={product}
                        />
                    ))
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
            scroll={{ x: 800 }}
            pagination={{
                showSizeChanger: true,
                showTotal: (total) => `${t("common.total")} ${total} ${t("products.products")}`,
                responsive: true,
                showQuickJumper: false,
                size: "small",
            }}
            size="small"
        />
    );
};

export default ProductsTable;
