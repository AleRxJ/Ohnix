import { ApiError } from "../utils/ApiError.js";
import { deleteFile } from "../utils/storage.js";

// Product.productImage is a NOT NULL column with a DB-level default of the
// literal string "default-product.png" (see utils/productImage.js) - no
// such file is ever served, it just means "no image". Every write in this
// module goes through syncPrimaryScalar so that column always mirrors
// whichever ProductImage row has isPrimary=true, keeping every existing
// reader of the scalar (reports, bulk import defaults, mapProduct) correct
// without those files needing to know ProductImage exists.
const PLACEHOLDER_PRODUCT_IMAGE = "default-product.png";

export const MAX_PRODUCT_IMAGES = 10;

const syncPrimaryScalar = async (tx, productId) => {
    const primary = await tx.productImage.findFirst({
        where: { productId, isPrimary: true },
        select: { url: true },
    });
    await tx.product.update({
        where: { id: productId },
        data: { productImage: primary ? primary.url : PLACEHOLDER_PRODUCT_IMAGE },
    });
};

// Appends one image at the end of the product's gallery. The first image a
// product ever gets is automatically primary (position 0) - covers both the
// legacy single-upload path (create/update's `product_image` field) and the
// new multi-upload endpoint.
export const attachImage = async (tx, productId, url) => {
    const count = await tx.productImage.count({ where: { productId } });
    const isFirst = count === 0;

    const image = await tx.productImage.create({
        data: { productId, url, position: count, isPrimary: isFirst },
    });

    if (isFirst) {
        await syncPrimaryScalar(tx, productId);
    }

    return image;
};

// Moves one existing image to position 0 (primary), shifting the images
// that were ahead of it down by one - order is otherwise preserved. This is
// also what a drag-to-front reorder reduces to (see reorderImages below).
export const setPrimaryImage = async (tx, productId, imageId) => {
    const images = await tx.productImage.findMany({
        where: { productId },
        orderBy: { position: "asc" },
    });

    const target = images.find((img) => img.id === imageId);
    if (!target) {
        throw new ApiError(404, "Image not found");
    }

    const reordered = [target, ...images.filter((img) => img.id !== imageId)];
    await applyOrder(tx, reordered);
    await syncPrimaryScalar(tx, productId);
};

// Full reorder - `orderedImageIds` must be exactly the product's current
// image ids, in the desired final order. Position 0 becomes primary,
// matching the spec's "moving an image to first place makes it the
// principal" behavior.
export const reorderImages = async (tx, productId, orderedImageIds) => {
    const images = await tx.productImage.findMany({ where: { productId } });
    const byId = new Map(images.map((img) => [img.id, img]));

    if (
        orderedImageIds.length !== images.length ||
        !orderedImageIds.every((id) => byId.has(id))
    ) {
        throw new ApiError(400, "image_ids must match the product's existing images exactly");
    }

    const reordered = orderedImageIds.map((id) => byId.get(id));
    await applyOrder(tx, reordered);
    await syncPrimaryScalar(tx, productId);
};

const applyOrder = async (tx, orderedImages) => {
    await Promise.all(
        orderedImages.map((img, index) =>
            tx.productImage.update({
                where: { id: img.id },
                data: { position: index, isPrimary: index === 0 },
            })
        )
    );
};

// Removes one image, re-normalizes the remaining positions to 0..n-1 (no
// gaps), and promotes the new position-0 image to primary if the deleted
// one was primary. Storage cleanup mirrors deleteProduct/updateProduct's
// existing fire-and-forget pattern - deleteFile already swallows its own
// errors, so it can't turn a successful delete into a failed response.
export const deleteImage = async (tx, productId, imageId) => {
    const image = await tx.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) {
        throw new ApiError(404, "Image not found");
    }

    await tx.productImage.delete({ where: { id: imageId } });
    deleteFile(image.url);

    const remaining = await tx.productImage.findMany({
        where: { productId },
        orderBy: { position: "asc" },
    });
    await applyOrder(tx, remaining);
    await syncPrimaryScalar(tx, productId);
};

// Replaces the primary image in place (the legacy single-file
// create/update path) - deletes the old primary's file and row, then
// attaches the new one at position 0. Used only when a product already has
// a primary image and a new `product_image` file is uploaded; a product
// with no images yet just calls attachImage directly.
export const replacePrimaryImage = async (tx, productId, newUrl) => {
    const currentPrimary = await tx.productImage.findFirst({
        where: { productId, isPrimary: true },
    });

    if (!currentPrimary) {
        await attachImage(tx, productId, newUrl);
        return;
    }

    deleteFile(currentPrimary.url);
    await tx.productImage.update({
        where: { id: currentPrimary.id },
        data: { url: newUrl },
    });
    await syncPrimaryScalar(tx, productId);
};
