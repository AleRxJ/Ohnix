// The Product.productImage column is NOT NULL with a DB-level default of
// the literal string "default-product.png" (no such file is ever served -
// there was never a real placeholder asset). Every product created without
// an uploaded photo ends up with that string stored, which the frontend
// then tries to load as a real image URL and shows as broken. Normalize it
// to null wherever a product is read so the frontend's own "no image"
// placeholder UI renders instead. Changing the column to be nullable would
// need a migration; this fixes both new and pre-existing rows without one.
const PLACEHOLDER_PRODUCT_IMAGE = "default-product.png";

export const normalizeProductImage = (productImage) =>
    productImage && productImage !== PLACEHOLDER_PRODUCT_IMAGE ? productImage : null;
