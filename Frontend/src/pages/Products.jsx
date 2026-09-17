import React, { useState, useCallback, useRef } from "react";
import { Layout, Card, Button, Form, message, Tooltip, Modal, InputNumber } from "antd";
import { PlusOutlined, ProductOutlined, LockOutlined, CloseOutlined } from "@ant-design/icons";

import ProductSearchBar from "../components/products/ProductSearchBar";
import ProductsTable from "../components/products/ProductsTable";
import ProductModal from "../components/products/ProductModal";
import ProductFilters from "../components/products/ProductFilters";
import ProductDetailsDrawer from "../components/products/ProductDetailsDrawer";
import BulkUploadModal from "../components/products/BulkUploadModal";
import AdjustStockModal from "../components/products/AdjustStockModal";

import { useProducts } from "../hooks/products/useProducts";
import { useCategories } from "../hooks/products/useCategories";
import { useUnits } from "../hooks/products/useUnits";
import useI18n from "../hooks/useI18n";
import useSubscription from "../hooks/useSubscription";
import { useTeam } from "../context/TeamContext";
import { useInventoryTour } from "../context/InventoryTourContext";
import { useDataInvalidation } from "../hooks/useDataInvalidation";

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
        adjustStock,
        fetchStockMovements,
        bulkUpdateLowStockThreshold,
        addProductImages,
        deleteProductImage,
        setPrimaryProductImage,
        reorderProductImages,
    } = useProducts();
    const { categories } = useCategories();
    const { units } = useUnits();
    const { t } = useI18n();
    const { can, loading: subscriptionLoading } = useSubscription();
    const { hasPermission } = useTeam();
    const canEdit = hasPermission("products", "edit");
    const { isOpen: isTutorialActive, notifyAction, effectiveSteps, stepIndex, createdRefs } = useInventoryTour();
    const currentTourStepId = effectiveSteps[stepIndex]?.id;

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
    // Extra (non-primary) images staged before a new product exists yet -
    // uploaded right after create succeeds. Unused once editing an existing
    // product, where the gallery is managed live instead - see
    // ProductImagesUpload.jsx.
    const [extraImageFiles, setExtraImageFiles] = useState([]);
    const [isAdjustStockVisible, setIsAdjustStockVisible] = useState(false);
    const [adjustingProduct, setAdjustingProduct] = useState(null);
    const [adjustStockLoading, setAdjustStockLoading] = useState(false);

    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [isBulkThresholdVisible, setIsBulkThresholdVisible] = useState(false);
    const [bulkThresholdValue, setBulkThresholdValue] = useState(null);
    const [bulkThresholdSaving, setBulkThresholdSaving] = useState(false);

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

    // Another connected user (or this same one, another tab) creating,
    // editing, deleting, or adjusting stock on a product - re-runs the
    // current search/filter instead of a bare fetchProducts() so an active
    // filter isn't silently dropped by a background refresh.
    useDataInvalidation("product", handleSearch);

    // The live gallery (edit mode) always reads from `products`, not the
    // `editingProduct` snapshot taken when the modal opened - every
    // add/delete/set-primary/reorder call already updates `products` (see
    // useProducts.js), so this stays fresh without extra plumbing.
    const liveEditingProduct = editingProduct
        ? products.find((p) => p._id === editingProduct._id) || editingProduct
        : null;

    // Keeps the primary-slot preview in sync when a gallery action (delete
    // the primary, set another image as primary, drag one to the front)
    // changes which image is primary - the rest of the product's local
    // state doesn't need to change for that.
    const handleGalleryUpdated = (updatedProduct) => {
        setImageUrl(updatedProduct.product_image || "");
    };

    const handleAddProduct = () => {
        setEditingProduct(null);
        setImageFile(null);
        setImageUrl("");
        setExtraImageFiles([]);
        form.resetFields();
        if (isTutorialActive && currentTourStepId === "create-product") {
            form.setFieldsValue({
                product_name: t("inventory_tour.practice_product_name"),
                product_code: `PR${Date.now().toString(36).toUpperCase().slice(-3)}`,
                category_id: createdRefs.category?.id,
                unit_id: createdRefs.unit?.id,
                buying_price: 10000,
                selling_price: 15000,
            });
        }
        setIsModalVisible(true);
    };

    const handleEditProduct = (product) => {
        setEditingProduct(product);
        setImageUrl(product.product_image || "");
        setImageFile(null);
        setExtraImageFiles([]);
        form.setFieldsValue({
            product_name: product.product_name,
            product_code: product.product_code,
            category_id: product.category_id._id,
            unit_id: product.unit_id._id,
            purchase_unit_id: product.purchase_unit_id?._id,
            purchase_unit_conversion_factor: product.purchase_unit_conversion_factor,
            is_kit: product.is_kit,
            components: (product.components || []).map((c) => ({
                product_id: c.product_id,
                quantity: c.quantity,
            })),
            tracks_batches: product.tracks_batches,
            is_manufactured: product.is_manufactured,
            recipe_components: (product.recipe_components || []).map((c) => ({
                product_id: c.product_id,
                quantity: c.quantity,
            })),
            buying_price: product.buying_price,
            selling_price: product.selling_price,
            unit_measure_code: product.unit_measure_code,
            standard_code: product.standard_code,
            tax_code: product.tax_code,
            tax_rate: product.tax_rate,
            tax_treatment: product.tax_treatment,
            low_stock_threshold: product.low_stock_threshold,
            is_physical: product.is_physical,
            weight_value: product.weight_value,
            weight_unit: product.weight_unit,
            height_value: product.height_value,
            width_value: product.width_value,
            length_value: product.length_value,
            dimension_unit: product.dimension_unit,
            units_per_package: product.units_per_package,
            packaging_type: product.packaging_type,
            is_fragile: product.is_fragile,
            package_weight_value: product.package_weight_value,
            package_height_value: product.package_height_value,
            package_width_value: product.package_width_value,
            package_length_value: product.package_length_value,
        });
        setIsModalVisible(true);
    };

    const handleViewDetails = (product) => {
        setSelectedProduct(product);
        setIsDetailsVisible(true);
        if (isTutorialActive) notifyAction("history-viewed");
    };

    const handleAdjustStock = (product) => {
        setAdjustingProduct(product);
        setIsAdjustStockVisible(true);
    };

    const handleSubmitAdjustStock = async (productId, payload) => {
        setAdjustStockLoading(true);
        const result = await adjustStock(productId, payload);
        setAdjustStockLoading(false);
        if (result.success) {
            setIsAdjustStockVisible(false);
            setAdjustingProduct(null);
            if (isTutorialActive) notifyAction("adjustment");
        }
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

            const validation = validateProductData(values, t);
            if (!validation.isValid) {
                Object.keys(validation.errors).forEach((key) => {
                    message.error(validation.errors[key]);
                });
                return;
            }

            setModalLoading(true);
            const formData = prepareProductFormData(values, imageFile);
            if (!editingProduct && isTutorialActive) {
                formData.append("is_tutorial_data", "true");
            }
            // Lets the backend reject this save if someone else edited the
            // same product after this form opened, instead of silently
            // overwriting their changes - see updateProduct/optimisticConcurrency.js.
            if (editingProduct?.updatedAt) {
                formData.append("expected_updated_at", editingProduct.updatedAt);
            }

            const result = editingProduct
                ? await updateProduct(editingProduct._id, formData)
                : await createProduct(formData);

            if (result.success) {
                // Extra images can only be attached once the product has an
                // id - stage-then-flush is what makes "create with several
                // images" a single flow from the user's perspective.
                if (!editingProduct && extraImageFiles.length > 0 && result.data?._id) {
                    await addProductImages(result.data._id, extraImageFiles);
                }
                setIsModalVisible(false);
                form.resetFields();
                setImageFile(null);
                setImageUrl("");
                setExtraImageFiles([]);
                if (!editingProduct && isTutorialActive) {
                    notifyAction(
                        "product",
                        result.data ? { id: result.data._id, name: result.data.product_name } : undefined
                    );
                }
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

    // deleteProduct() (useProducts.js) already shows its own success/failure
    // toast with the right message either way - no need to duplicate that
    // here (a prior version of this wrapper did, using the wrong success-
    // shaped key as the error text, so a failed delete looked like it had
    // succeeded).
    const handleDeleteProduct = async (productId) => {
        await deleteProduct(productId);
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

    const handleOpenBulkThreshold = () => {
        setBulkThresholdValue(null);
        setIsBulkThresholdVisible(true);
    };

    const handleSaveBulkThreshold = async () => {
        setBulkThresholdSaving(true);
        const result = await bulkUpdateLowStockThreshold(selectedRowKeys, bulkThresholdValue ?? null);
        setBulkThresholdSaving(false);
        if (result?.success) {
            setIsBulkThresholdVisible(false);
            setSelectedRowKeys([]);
        }
    };

    return (
        <Layout className="bg-transparent">
            <Content className="p-2 sm:p-4 lg:p-6 bg-transparent text-[var(--ohnix-text-primary)]">
                <div className="max-w-full lg:max-w-7xl mx-auto">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-4 sm:mb-6 gap-4">
                        <div className="flex-1 min-w-0">
                            <h1 className="truncate mb-1 text-3xl sm:text-4xl font-bold flex items-center gap-2 text-[var(--ohnix-text-primary)]">
                                {t("products.products")}
                                <ProductOutlined className="text-[#44F3F0] inline-block ml-2" />
                            </h1>
                            <p className="text-[var(--ohnix-text-muted)] text-base md:text-sm hidden sm:block">
                                {t("products.manage_inventory")}
                            </p>
                        </div>
                        <div className="flex-shrink-0 flex gap-2">
                            {/* subscriptionLoading: plan starts unresolved (useSubscription.js),
                                so rendering either branch before it settles risks a locked-badge
                                flash on accounts that actually have the feature - skip both until
                                we actually know. */}
                            {subscriptionLoading ? null : can("bulkUpload") ? (
                                <Button
                                    onClick={() => setIsBulkUploadVisible(true)}
                                    size="large"
                                    className="w-full sm:w-auto"
                                >
                                    {t("products.bulk_upload")}
                                </Button>
                            ) : (
                                <Tooltip
                                    title={t("products.bulk_upload_upsell_tooltip")}
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
                            <Tooltip title={canEdit ? "" : t("common.no_permission_to_edit")}>
                                <span className="w-full sm:w-auto inline-block">
                                    <Button
                                        type="primary"
                                        icon={<PlusOutlined />}
                                        onClick={handleAddProduct}
                                        size="large"
                                        className="w-full sm:w-auto"
                                        block={window.innerWidth < 640}
                                        disabled={!canEdit}
                                        data-tour="tour-add-product"
                                    >
                                        <span className="hidden xs:inline">
                                            {t("products.add_product")}
                                        </span>
                                        <span className="inline xs:hidden">{t("common.add")}</span>
                                    </Button>
                                </span>
                            </Tooltip>
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

                    {selectedRowKeys.length > 0 && (
                        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-4 py-2.5">
                            <span className="text-sm font-medium text-[var(--ohnix-text-soft)]">
                                {t("products.bulk_selection_count", { count: selectedRowKeys.length })}
                            </span>
                            {subscriptionLoading ? (
                                <Button size="small" loading disabled>
                                    {t("products.bulk_adjust_threshold")}
                                </Button>
                            ) : can("configurableAlerts") ? (
                                <Button size="small" onClick={handleOpenBulkThreshold}>
                                    {t("products.bulk_adjust_threshold")}
                                </Button>
                            ) : (
                                <Tooltip title={t("products.low_stock_threshold_upsell")}>
                                    <span>
                                        <Button size="small" disabled icon={<LockOutlined />}>
                                            {t("products.bulk_adjust_threshold")}
                                        </Button>
                                    </span>
                                </Tooltip>
                            )}
                            <Button
                                size="small"
                                type="text"
                                icon={<CloseOutlined />}
                                onClick={() => setSelectedRowKeys([])}
                                className="text-[var(--ohnix-text-dim)]"
                            >
                                {t("products.bulk_clear_selection")}
                            </Button>
                        </div>
                    )}

                    <Card
                        className="overflow-hidden border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card-soft)] shadow-[0_16px_36px_rgba(0,0,0,0.3)]"
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
                                onAdjustStock={handleAdjustStock}
                                selectedRowKeys={selectedRowKeys}
                                onSelectionChange={setSelectedRowKeys}
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
                        allProducts={products}
                        editingProduct={editingProduct}
                        imageUrl={imageUrl}
                        onSave={handleSaveProduct}
                        onCancel={() => {
                            if (isSubmittingRef.current) return;
                            setIsModalVisible(false);
                            setEditingProduct(null);
                            setImageFile(null);
                            setImageUrl("");
                            setExtraImageFiles([]);
                            form.resetFields();
                        }}
                        onImageChange={handleImageChange}
                        width={window.innerWidth < 768 ? "95%" : "800px"}
                        centered={window.innerWidth < 768}
                        isTourCreateStep={
                            isTutorialActive && !editingProduct && currentTourStepId === "create-product"
                        }
                        productImages={liveEditingProduct?.images}
                        extraImageFiles={extraImageFiles}
                        onExtraImageFilesChange={setExtraImageFiles}
                        onGalleryUpdated={handleGalleryUpdated}
                        addProductImages={addProductImages}
                        deleteProductImage={deleteProductImage}
                        setPrimaryProductImage={setPrimaryProductImage}
                        reorderProductImages={reorderProductImages}
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
                        onFetchStockMovements={fetchStockMovements}
                        placement={window.innerWidth < 768 ? "bottom" : "right"}
                        height={window.innerWidth < 768 ? "80vh" : undefined}
                        width={window.innerWidth < 768 ? "100%" : "500px"}
                    />

                    <AdjustStockModal
                        visible={isAdjustStockVisible}
                        product={adjustingProduct}
                        loading={adjustStockLoading}
                        onSubmit={handleSubmitAdjustStock}
                        onCancel={() => {
                            setIsAdjustStockVisible(false);
                            setAdjustingProduct(null);
                        }}
                    />

                    <BulkUploadModal
                        visible={isBulkUploadVisible}
                        categories={categories}
                        units={units}
                        onClose={() => setIsBulkUploadVisible(false)}
                        onComplete={handleBulkUploadComplete}
                    />

                    <Modal
                        title={t("products.bulk_adjust_threshold_title")}
                        open={isBulkThresholdVisible}
                        onCancel={() => setIsBulkThresholdVisible(false)}
                        onOk={handleSaveBulkThreshold}
                        confirmLoading={bulkThresholdSaving}
                        okText={t("common.save")}
                        cancelText={t("common.cancel")}
                    >
                        <p className="text-sm text-[var(--ohnix-text-muted)] mb-3">
                            {t("products.bulk_adjust_threshold_desc", { count: selectedRowKeys.length })}
                        </p>
                        <InputNumber
                            min={0}
                            precision={0}
                            size="large"
                            className="w-full"
                            placeholder={t("products.bulk_adjust_threshold_placeholder")}
                            value={bulkThresholdValue}
                            onChange={setBulkThresholdValue}
                        />
                        <p className="text-xs text-[var(--ohnix-text-dim)] mt-2">
                            {t("products.bulk_adjust_threshold_clear_hint")}
                        </p>
                    </Modal>
                </div>
            </Content>
        </Layout>
    );
};

export default Products;
