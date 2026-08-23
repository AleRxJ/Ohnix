import { formatCurrency } from "./currency";

// Fallback used only when a product has no per-product low_stock_threshold
// override (Escala+ feature) - kept in sync with the backend's own default
// (SystemSetting.lowStockDefaultThreshold, see systemSettings.js).
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

// Placeholder shown by <Image fallback> when a product has no image or its
// image fails to load. Drawn as a boxed package (not a generic photo/
// mountain icon) so it actually reads as "product" at a glance. Must stay a
// complete, valid data URI - a truncated one renders as a broken-image icon
// instead of a placeholder.
export const PRODUCT_IMAGE_FALLBACK =
    "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' fill='%23101826'/%3E%3Cg stroke='%2329D8D5' stroke-width='4' fill='none' stroke-linejoin='round' stroke-linecap='round' opacity='0.75'%3E%3Cpath d='M50 18 L83 36 L83 64 L50 82 L17 64 L17 36 Z'/%3E%3Cpath d='M17 36 L50 54 L83 36'/%3E%3Cpath d='M50 54 L50 82'/%3E%3C/g%3E%3C/svg%3E";

export const formatPrice = (price, currencyCode) => {
    return formatCurrency(price, currencyCode);
};

export const calculateProfitMargin = (sellingPrice, buyingPrice) => {
    if (typeof sellingPrice !== "number" || typeof buyingPrice !== "number") {
        return 0;
    }
    return sellingPrice - buyingPrice;
};

export const calculateProfitPercentage = (sellingPrice, buyingPrice) => {
    if (
        typeof sellingPrice !== "number" ||
        typeof buyingPrice !== "number" ||
        sellingPrice === 0
    ) {
        return 0;
    }
    return ((sellingPrice - buyingPrice) / sellingPrice) * 100;
};

export const getStockStatus = (stock, lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD) => {
    if (stock === 0) {
        return { status: "error", text: "Out of Stock", color: "red" };
    } else if (stock <= lowStockThreshold) {
        return { status: "warning", text: "Low Stock", color: "orange" };
    }
    return { status: "success", text: "In Stock", color: "green" };
};

export const validateProductData = (productData, t) => {
    const errors = {};
    let isValid = true;

    if (!productData.product_name?.trim()) {
        errors.product_name = t("products.enter_product_name_required");
        isValid = false;
    }

    if (!productData.product_code?.trim()) {
        errors.product_code = t("products.enter_product_code_required");
        isValid = false;
    }

    if (!productData.category_id) {
        errors.category_id = t("products.select_category_required");
        isValid = false;
    }

    if (!productData.unit_id) {
        errors.unit_id = t("products.select_unit_required");
        isValid = false;
    }

    if (!productData.buying_price || productData.buying_price <= 0) {
        errors.buying_price = t("products.price_must_be_positive");
        isValid = false;
    }

    if (!productData.selling_price || productData.selling_price <= 0) {
        errors.selling_price = t("products.price_must_be_positive");
        isValid = false;
    }

    if (
        productData.selling_price &&
        productData.buying_price &&
        productData.selling_price < productData.buying_price
    ) {
        errors.selling_price = t(
            "products.selling_price_greater_than_buying_price"
        );
        isValid = false;
    }

    return { isValid, errors };
};

export const prepareProductFormData = (formValues, imageFile = null) => {
    const formData = new FormData();

    Object.keys(formValues).forEach((key) => {
        if (
            key !== "product_image" &&
            formValues[key] !== undefined &&
            formValues[key] !== null
        ) {
            formData.append(key, formValues[key]);
        }
    });

    if (imageFile) {
        formData.append("product_image", imageFile);
    }

    return formData;
};

export const filterProducts = (products, filters) => {
    let filteredProducts = [...products];

    if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        filteredProducts = filteredProducts.filter(
            (product) =>
                product.product_name.toLowerCase().includes(searchTerm) ||
                product.product_code.toLowerCase().includes(searchTerm)
        );
    }

    if (filters.category) {
        filteredProducts = filteredProducts.filter(
            (product) => product.category_id._id === filters.category
        );
    }

    if (filters.stockFilter) {
        filteredProducts = filteredProducts.filter((product) => {
            const threshold = product.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
            if (filters.stockFilter === "out") return product.stock === 0;
            if (filters.stockFilter === "low")
                return product.stock > 0 && product.stock <= threshold;
            if (filters.stockFilter === "in") return product.stock > threshold;
            return true;
        });
    }

    return filteredProducts;
};

export const sortProducts = (products, sortBy, sortOrder = "asc") => {
    const sortedProducts = [...products];

    sortedProducts.sort((a, b) => {
        let aValue, bValue;

        switch (sortBy) {
            case "name":
                aValue = a.product_name.toLowerCase();
                bValue = b.product_name.toLowerCase();
                break;
            case "price":
                aValue = a.selling_price;
                bValue = b.selling_price;
                break;
            case "stock":
                aValue = a.stock;
                bValue = b.stock;
                break;
            case "category":
                aValue = a.category_id.category_name.toLowerCase();
                bValue = b.category_id.category_name.toLowerCase();
                break;
            default:
                return 0;
        }

        if (typeof aValue === "string") {
            return sortOrder === "asc"
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        }
        return sortOrder === "asc" ? aValue - bValue : bValue - aValue;
    });

    return sortedProducts;
};

export const generateProductCode = (categoryName, sequence) => {
    const prefix = categoryName.substring(0, 2).toUpperCase();
    const paddedSequence = sequence.toString().padStart(3, "0");
    return `${prefix}${paddedSequence}`;
};

export const calculateInventoryStats = (products) => {
    const stats = {
        totalProducts: products.length,
        totalStockValue: 0,
        totalSellingValue: 0,
        outOfStockCount: 0,
        lowStockCount: 0,
        inStockCount: 0,
    };

    products.forEach((product) => {
        stats.totalStockValue += product.buying_price * product.stock;
        stats.totalSellingValue += product.selling_price * product.stock;

        const threshold = product.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
        if (product.stock === 0) stats.outOfStockCount++;
        else if (product.stock <= threshold) stats.lowStockCount++;
        else stats.inStockCount++;
    });

    return stats;
};
