import { forwardRef, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Empty, Skeleton } from "antd";
import { BarcodeOutlined, SearchOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { formatCurrency } from "../../utils/currency";
import { DEFAULT_LOW_STOCK_THRESHOLD } from "../../utils/productUtils";
import { availableStock } from "../../hooks/pos/usePosCart";

// Deterministic hue per product name, so a catalog without photos still
// reads as distinct, colorful tiles (same treatment as the demo reel).
const hueOf = (text = "") => {
    let hash = 0;
    for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
    return hash;
};

const normalize = (value) =>
    String(value ?? "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");

// A scanner types the code and presses Enter - an exact code match wins over
// a fuzzy name match, so scanning "7701234" never adds "Café 7701234 g".
const findExactCode = (products, query) => {
    const q = normalize(query).trim();
    if (!q) return null;
    return products.find((p) => [p.barcode, p.sku, p.product_code].some((code) => code && normalize(code) === q)) || null;
};

const ProductTile = ({ product, quantity, flashKey, onAdd }) => {
    const { t } = useI18n();
    const stock = availableStock(product);
    const soldOut = stock < 1 || quantity >= stock;
    const threshold = product.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
    const hue = hueOf(product.product_name);

    const stockLabel = stock < 1 ? t("pos.sold_out") : t("pos.units_left", { count: stock });
    const stockClass = stock < 1 ? "is-out" : stock <= threshold ? "is-low" : "";

    return (
        <button
            type="button"
            className={`pos-card ${quantity > 0 ? "is-in-cart" : ""} ${flashKey ? "is-flash" : ""}`}
            onClick={() => onAdd(product)}
            disabled={soldOut}
            title={product.product_name}
            key={flashKey || product._id}
        >
            <div
                className="pos-card-media"
                style={{
                    background: `radial-gradient(circle at 30% 25%, hsla(${hue},80%,62%,0.55), hsla(${hue},70%,28%,0.28) 62%, var(--ohnix-line-2))`,
                }}
            >
                {product.product_image ? (
                    <img src={product.product_image} alt="" loading="lazy" />
                ) : (
                    <span>{product.product_name?.trim()?.[0]?.toUpperCase() || "?"}</span>
                )}
                {flashKey ? <span className="pos-plus-one">+1</span> : null}
            </div>
            {quantity > 0 && <span className="pos-card-qty">{quantity}</span>}
            <div className="pos-card-name">{product.product_name}</div>
            <div className="pos-card-foot">
                <span className="pos-card-price">{formatCurrency(product.selling_price, "COP")}</span>
                <span className={`pos-card-stock ${stockClass}`}>{stockLabel}</span>
            </div>
        </button>
    );
};

ProductTile.propTypes = {
    product: PropTypes.object.isRequired,
    quantity: PropTypes.number.isRequired,
    flashKey: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    onAdd: PropTypes.func.isRequired,
};

const PosProductGrid = forwardRef(({ products, loading, quantityOf, lastAddedId, bump, onAdd, onScanMiss }, searchRef) => {
    const { t } = useI18n();
    const [query, setQuery] = useState("");
    const [category, setCategory] = useState("all");

    const sellable = useMemo(() => products.filter((p) => p.status !== "inactive"), [products]);

    const categories = useMemo(() => {
        const byId = new Map();
        sellable.forEach((p) => {
            if (p.category_id?._id) byId.set(p.category_id._id, p.category_id.category_name);
        });
        return [...byId.entries()].sort((a, b) => String(a[1]).localeCompare(String(b[1])));
    }, [sellable]);

    const visible = useMemo(() => {
        const q = normalize(query).trim();
        return sellable
            .filter((p) => category === "all" || p.category_id?._id === category)
            .filter(
                (p) =>
                    !q ||
                    normalize(p.product_name).includes(q) ||
                    [p.barcode, p.sku, p.product_code].some((code) => code && normalize(code).includes(q))
            )
            // In-stock first, then alphabetical - sold-out tiles sink.
            .sort((a, b) => (availableStock(b) > 0) - (availableStock(a) > 0) || String(a.product_name).localeCompare(String(b.product_name)));
    }, [sellable, category, query]);

    const handleKeyDown = (event) => {
        if (event.key === "Escape") {
            setQuery("");
            return;
        }
        if (event.key !== "Enter" || !query.trim()) return;
        event.preventDefault();
        const exact = findExactCode(sellable, query);
        const target = exact || (visible.length === 1 ? visible[0] : null);
        if (target) {
            onAdd(target);
            setQuery("");
        } else {
            onScanMiss(query.trim());
        }
    };

    return (
        <div className="space-y-4">
            <label className="pos-search">
                <SearchOutlined className="text-lg text-[var(--ohnix-text-dim)]" />
                <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={t("pos.search_placeholder")}
                    aria-label={t("pos.search_placeholder")}
                    autoComplete="off"
                    inputMode="search"
                />
                <BarcodeOutlined className="hidden sm:inline text-lg text-[var(--ohnix-text-dim)]" />
                <kbd className="pos-kbd hidden md:inline">F2</kbd>
            </label>

            {categories.length > 0 && (
                <div className="pos-chips" role="tablist">
                    <button type="button" className={`pos-chip ${category === "all" ? "is-active" : ""}`} onClick={() => setCategory("all")}>
                        {t("pos.all_categories")}
                    </button>
                    {categories.map(([id, name]) => (
                        <button
                            key={id}
                            type="button"
                            className={`pos-chip ${category === id ? "is-active" : ""}`}
                            onClick={() => setCategory(id)}
                        >
                            {name}
                        </button>
                    ))}
                </div>
            )}

            {loading && products.length === 0 ? (
                <div className="pos-grid">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <Skeleton.Button key={i} active block style={{ height: 210, borderRadius: 18 }} />
                    ))}
                </div>
            ) : visible.length === 0 ? (
                <div className="py-16">
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description={<span className="text-[var(--ohnix-text-muted)]">{query ? t("pos.no_results", { query }) : t("pos.no_products")}</span>}
                    />
                </div>
            ) : (
                <div className="pos-grid">
                    {visible.map((product) => (
                        <ProductTile
                            key={product._id}
                            product={product}
                            quantity={quantityOf(product._id)}
                            flashKey={lastAddedId === product._id ? bump : null}
                            onAdd={onAdd}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

PosProductGrid.displayName = "PosProductGrid";

PosProductGrid.propTypes = {
    products: PropTypes.array.isRequired,
    loading: PropTypes.bool,
    quantityOf: PropTypes.func.isRequired,
    lastAddedId: PropTypes.string,
    bump: PropTypes.number,
    onAdd: PropTypes.func.isRequired,
    onScanMiss: PropTypes.func.isRequired,
};

export default PosProductGrid;
