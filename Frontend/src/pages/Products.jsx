import React, { useState, useCallback, useRef } from "react";
import { Layout, Card, Button, Form, message, Tooltip } from "antd";
import { PlusOutlined, ProductOutlined, LockOutlined } from "@ant-design/icons";

import ProductSearchBar from "../components/products/ProductSearchBar";
import ProductsTable from "../components/products/ProductsTable";
import ProductModal from "../components/products/ProductModal";
import ProductFilters from "../components/products/ProductFilters";
import ProductDetailsDrawer from "../components/products/ProductDetailsDrawer";
import BulkUploadModal from "../components/products/BulkUploadModal";

import { useProducts } from "../hooks/products/useProducts";
import { useCategories } from "../hooks/products/useCategories";
import { useUnits } from "../hooks/products/useUnits";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";

import {
    prepareProductFormData,
    validateProductData,
} from "../utils/productUtils";

const { Content } = Layout;

const Products = () => {
    const {
        products,
        loading,
        fetchProducts,
        createProduct,
        updateProduct,
        deleteProduct,
    } = useProducts();
    const { categories } = useCategories();
    const { units } = useUnits();
    const { t, currentLanguage } = useI18n();
    const { can } = useSubscription();

    const [form] = Form.useForm();

    const [searchText, setSearchText] = useState("");
    const [categoryFilter, setCategoryFilter] = useState(null);
    const [stockFilter, setStockFilter] = useState(null);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [isFiltersVisible, setIsFiltersVisible] = useState(false);
    const [isDetailsVisible, setIsDetailsVisible] = useState(false);
    const [isBulkUploadVisible, setIsBulkUploadVisible] = useState(false);
    const [editingProduct, setEditingProduct] = useState(null);
    const [selectedProduct, setSelectedProduct] = useState(null);
    const [modalLoading, setModalLoading] = useState(false);
    const [imageFile, setImageFile] = useState(null);
    const [imageUrl, setImageUrl] = useState("");

    const isSubmittingRef = useRef(false);

    const handleSearch = useCallback(() => {
        fetchProducts({
            search: searchText,
            category: categoryFilter,
            stockFilter,
        });
    }, [searchText, categoryFilter, stockFilter, fetchProducts]);

    const handleReset = useCallback(() => {
        setSearchText("");
        setCategoryFilter(null);
        setStockFilter(null);
        fetchProducts();
    }, [fetchProducts]);

    const handleAddProduct = () => {
        setEditingProduct(null);
        setImageFile(null);
        setImageUrl("");
        form.resetFields();
        setIsModalVisible(true);
    };

    const handleEditProduct = (product) => {
        setEditingProduct(product);
        setImageUrl(product.product_image || "");
        setImageFile(null);
        form.setFieldsValue({
            product_name: product.product_name,
            product_code: product.product_code,
            category_id: product.category_id._id,
            unit_id: product.unit_id._id,
            buying_price: product.buying_price,
            selling_price: product.selling_price,
            unit_measure_code: product.unit_measure_code,
            standard_code: product.standard_code,
            tax_code: product.tax_code,
            tax_rate: product.tax_rate,
            low_stock_threshold: product.low_stock_threshold,
        });
        setIsModalVisible(true);
    };

    const handleViewDetails = (product) => {
        setSelectedProduct(product);
        setIsDetailsVisible(true);
    };

    const handleImageChange = (info) => {
        const { fileList } = info;
        if (fileList.length > 0) {
            const file = fileList[0].originFileObj;
            setImageFile(file);
            const reader = new FileReader();
            reader.onload = (e) => setImageUrl(e.target.result);
            reader.readAsDataURL(file);
        } else {
            setImageFile(null);
            setImageUrl(editingProduct?.product_image || "");
        }
    };

    const handleSaveProduct = async () => {
        if (isSubmittingRef.current) return;
        isSubmittingRef.current = true;

        try {
            const values = await form.validateFields();

            const validation = validateProductData(values);
            if (!validation.isValid) {
                Object.keys(validation.errors).forEach((key) => {
                    message.error(validation.errors[key]);
                });
                return;
            }

            setModalLoading(true);
            const formData = prepareProductFormData(values, imageFile);

            const result = editingProduct
                ? await updateProduct(editingProduct._id, formData)
                : await createProduct(formData);

            if (result.success) {
                setIsModalVisible(false);
                form.resetFields();
                setImageFile(null);
                setImageUrl("");
                setEditingProduct(null);
            }
        } catch (error) {
            console.error("Form validation error:", error);
            message.error(t("products.enter_product_name_required"));
        } finally {
            setModalLoading(false);
            // FIX 4: Always release the lock, even on error.
            isSubmittingRef.current = false;
        }
    };

    const handleDeleteProduct = async (productId) => {
        const result = await deleteProduct(productId);
        if (!result.success) {
            message.error(t("products.product_deleted") || "Error");
        }
    };

    const handleApplyFilters = () => {
        setIsFiltersVisible(false);
        handleSearch();
    };

    const handleResetFilters = () => {
        setCategoryFilter(null);
        setStockFilter(null);
        setIsFiltersVisible(false);
        handleReset();
    };

    const handleBulkUploadComplete = () => {
        setIsBulkUploadVisible(false);
        fetchProducts();
    };

    return (
        <Layout className="bg-transparent">
            <Content className="p-2 sm:p-4 lg:p-6 bg-transparent text-white">
                <div className="max-w-full lg:max-w-7xl mx-auto">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="truncate mb-1 text-3xl sm:text-4xl font-bold flex items-center gap-2 text-white">
                                {t("products.products")}
                                <ProductOutlined className="text-[#44F3F0] inline-block ml-2" />
                            </h1>
                            <p className="text-[#A9B3B8] text-base md:text-sm hidden sm:block">
                                {t("products.manage_inventory")}
                            </p>
                        </div>
                        <div className="flex-shrink-0 flex gap-2">
                            {can("bulkUpload") ? (
                                <Button
                                    onClick={() => setIsBulkUploadVisible(true)}
                                    size="large"
                                    className="w-full sm:w-auto"
                                >
                                    {t("products.bulk_upload")}
                                </Button>
                            ) : (
                                <Tooltip
                                    title={
                                        currentLanguage === "es"
                                            ? "Carga masiva disponible desde el plan Negocio"
                                            : "Bulk upload available from the Business plan"
                                    }
                                >
                                    <span>
                                        <Button
                                            disabled
                                            icon={<LockOutlined />}
                                            size="large"
                                            className="w-full sm:w-auto"
                                        >
                                            {t("products.bulk_upload")}
                                        </Button>
                                    </span>
                                </Tooltip>
                            )}
                            <Button
                                type="primary"
                                icon={<PlusOutlined />}
                                onClick={handleAddProduct}
                                size="large"
                                className="w-full sm:w-auto"
                                block={window.innerWidth < 640}
                            >
                                <span className="hidden xs:inline">
                                    {t("products.add_product")}
                                </span>
                                <span className="inline xs:hidden">{t("common.add")}</span>
                            </Button>
                        </div>
                    </div>

                    <div className="mb-4 sm:mb-6">
                        <ProductSearchBar
                            searchText={searchText}
                            onSearchChange={setSearchText}
                            onSearch={handleSearch}
                            onShowFilters={() => setIsFiltersVisible(true)}
                            onReset={handleReset}
                        />
                    </div>

                    <Card
                        className="overflow-hidden border border-white/10 bg-[#0B0B0B]/90 shadow-[0_16px_36px_rgba(0,0,0,0.3)]"
                        bodyStyle={{
                            padding: window.innerWidth < 768 ? "12px" : "24px",
                            overflowX: "auto",
                        }}
                    >
                        <div className="min-w-full">
                            <ProductsTable
                                products={products}
                                loading={loading}
                                categories={categories}
                                onEdit={handleEditProduct}
                                onDelete={handleDeleteProduct}
                                onViewDetails={handleViewDetails}
                            />
                        </div>
                    </Card>

                    <ProductModal
                        visible={isModalVisible}
                        title={
                            editingProduct ? t("products.edit_product") : t("products.add_new_product")
                        }
                        form={form}
                        loading={modalLoading}
                        categories={categories}
                        units={units}
                        editingProduct={editingProduct}
                        imageUrl={imageUrl}
                        onSave={handleSaveProduct}
                        onCancel={() => {
                            if (isSubmittingRef.current) return;
                            setIsModalVisible(false);
                            setEditingProduct(null);
                            setImageFile(null);
                            setImageUrl("");
                            form.resetFields();
                        }}
                        onImageChange={handleImageChange}
                        width={window.innerWidth < 768 ? "95%" : "800px"}
                        centered={window.innerWidth < 768}
                    />

                    <ProductFilters
                        visible={isFiltersVisible}
                        categories={categories}
                        categoryFilter={categoryFilter}
                        stockFilter={stockFilter}
                        onCategoryChange={setCategoryFilter}
                        onStockChange={setStockFilter}
                        onApply={handleApplyFilters}
                        onReset={handleResetFilters}
                        onClose={() => setIsFiltersVisible(false)}
                        placement={window.innerWidth < 768 ? "bottom" : "right"}
                        height={window.innerWidth < 768 ? "70vh" : undefined}
                        width={window.innerWidth < 768 ? "100%" : "400px"}
                    />

                    <ProductDetailsDrawer
                        visible={isDetailsVisible}
                        product={selectedProduct}
                        onClose={() => {
                            setIsDetailsVisible(false);
                            setSelectedProduct(null);
                        }}
                        placement={window.innerWidth < 768 ? "bottom" : "right"}
                        height={window.innerWidth < 768 ? "80vh" : undefined}
                        width={window.innerWidth < 768 ? "100%" : "500px"}
                    />

                    <BulkUploadModal
                        visible={isBulkUploadVisible}
                        categories={categories}
                        units={units}
                        onClose={() => setIsBulkUploadVisible(false)}
                        onComplete={handleBulkUploadComplete}
                    />
                </div>
            </Content>
        </Layout>
    );
};

export default Products;
