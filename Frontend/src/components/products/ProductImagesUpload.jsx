import React, { useEffect, useRef, useState } from "react";
import { Upload, Tooltip, Popconfirm } from "antd";
import { PlusOutlined, DeleteOutlined, StarOutlined, LoadingOutlined } from "@ant-design/icons";
import PhotoDropZone from "../common/PhotoDropZone";
import useI18n from "../../hooks/useI18n";

// No technical storage limit (R2 is plain object storage) - this is purely
// a UX/abuse bound, generous enough for "principal + a few angles/details".
// Kept in sync with Backend/services/productImage.service.js#MAX_PRODUCT_IMAGES.
const MAX_PRODUCT_IMAGES = 10;

const AddTile = ({ t }) => (
    <div className="flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-muted)] transition-colors duration-200 hover:border-[#29D8D5]/60 hover:bg-[var(--ohnix-hover-overlay)] cursor-pointer">
        <PlusOutlined />
        <span className="px-1 text-center text-[10px] leading-tight">{t("products.add_image")}</span>
    </div>
);

const Thumbnail = ({
    url,
    index,
    busy,
    progress,
    canSetPrimary,
    isDragOver,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onSetPrimary,
    onDelete,
    t,
}) => (
    <div
        draggable={!busy}
        onDragStart={() => onDragStart(index)}
        onDragOver={(e) => {
            e.preventDefault();
            onDragOver(index);
        }}
        onDragLeave={onDragLeave}
        onDrop={(e) => {
            e.preventDefault();
            onDrop(index);
        }}
        className={`group relative h-20 w-20 flex-shrink-0 cursor-grab overflow-hidden rounded-lg border bg-[var(--ohnix-line-1)] transition-colors duration-150 active:cursor-grabbing ${
            isDragOver ? "border-[#29D8D5]" : "border-[var(--ohnix-line-5)]"
        }`}
    >
        <img src={url} alt="" className="h-full w-full object-cover" />
        {busy ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/60">
                <LoadingOutlined className="text-base text-white" />
                {typeof progress === "number" && (
                    <span className="text-[10px] text-white">{progress}%</span>
                )}
            </div>
        ) : (
            <div className="absolute inset-0 flex items-center justify-center gap-1.5 bg-black/0 opacity-0 transition-all duration-150 group-hover:bg-black/55 group-hover:opacity-100">
                {canSetPrimary && (
                    <Tooltip title={t("products.set_as_primary")}>
                        <button
                            type="button"
                            onClick={onSetPrimary}
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                        >
                            <StarOutlined className="text-xs" />
                        </button>
                    </Tooltip>
                )}
                <Popconfirm
                    title={t("common.warning")}
                    onConfirm={onDelete}
                    okText={t("common.yes")}
                    cancelText={t("common.no")}
                >
                    <button
                        type="button"
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
                    >
                        <DeleteOutlined className="text-xs" />
                    </button>
                </Popconfirm>
            </div>
        )}
    </div>
);

// Evolves the old single-image ProductImageUpload into a gallery: the
// primary slot keeps PhotoDropZone exactly as it already worked (staged
// File, submitted with the rest of the form on "Guardar producto"), and a
// thumbnail row below it manages every additional image.
//
// Creating a product: there's no product id yet, so extra images are only
// staged client-side (`extraFiles`) and uploaded right after the create
// request succeeds (see Products.jsx#handleSaveProduct).
// Editing a product: every gallery action (add/delete/set primary/reorder)
// hits its endpoint immediately - it's a relational child resource, not a
// form field, so it doesn't wait for "Guardar producto".
const ProductImagesUpload = ({
    imageUrl,
    onImageChange,
    isEditing,
    productId,
    images,
    extraFiles,
    onExtraFilesChange,
    onGalleryUpdated,
    addProductImages,
    deleteProductImage,
    setPrimaryProductImage,
    reorderProductImages,
}) => {
    const { t } = useI18n();
    const [busyKeys, setBusyKeys] = useState({});
    const dragIndexRef = useRef(null);
    const [dragOverIndex, setDragOverIndex] = useState(null);
    const objectUrlsRef = useRef(new Map());

    useEffect(() => {
        const urls = objectUrlsRef.current;
        return () => {
            urls.forEach((url) => URL.revokeObjectURL(url));
            urls.clear();
        };
    }, []);

    const getObjectUrl = (file) => {
        if (!objectUrlsRef.current.has(file)) {
            objectUrlsRef.current.set(file, URL.createObjectURL(file));
        }
        return objectUrlsRef.current.get(file);
    };

    const setBusy = (key, value) => {
        setBusyKeys((prev) => {
            const next = { ...prev };
            if (value === false || value === undefined) delete next[key];
            else next[key] = value;
            return next;
        });
    };

    const primaryImage = (images || []).find((img) => img.is_primary);
    const secondaryExisting = (images || []).filter((img) => !img.is_primary);
    const totalCount = isEditing ? (images || []).length : 1 + extraFiles.length;
    const atMax = totalCount >= MAX_PRODUCT_IMAGES;

    // antd's Upload fires onChange once per file for a multi-select, but
    // `info.fileList` is cumulative across every selection since mount
    // (not just the new one) - reading it directly would re-stage/re-upload
    // files already processed by an earlier event. `info.file` is always
    // just the single file this particular event is about, so that's what
    // gets appended, one at a time, immune to how many events fire.
    const handlePickExtra = (info) => {
        const file = info.file && (info.file.originFileObj || info.file);
        if (!(file instanceof File)) return;

        if (isEditing && productId) {
            const key = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
            setBusy(key, 0);
            addProductImages(productId, [file], (evt) => {
                if (!evt.total) return;
                setBusy(key, Math.round((evt.loaded * 100) / evt.total));
            }).then((result) => {
                setBusy(key, false);
                if (result?.success) onGalleryUpdated?.(result.data);
            });
        } else {
            onExtraFilesChange((prev) =>
                prev.length + 1 > MAX_PRODUCT_IMAGES - 1 ? prev : [...prev, file]
            );
        }
    };

    const handleDeleteExisting = (imageId) => {
        setBusy(imageId, true);
        deleteProductImage(productId, imageId).then((result) => {
            setBusy(imageId, false);
            if (result?.success) onGalleryUpdated?.(result.data);
        });
    };

    const handleDeleteStaged = (index) => {
        const next = extraFiles.slice();
        next.splice(index, 1);
        onExtraFilesChange(next);
    };

    const handleSetPrimary = (imageId) => {
        setBusy(imageId, true);
        setPrimaryProductImage(productId, imageId).then((result) => {
            setBusy(imageId, false);
            if (result?.success) onGalleryUpdated?.(result.data);
        });
    };

    const handleDragStart = (index) => {
        dragIndexRef.current = index;
    };
    const handleDragOver = (index) => setDragOverIndex(index);
    const handleDragLeave = () => setDragOverIndex(null);
    const handleDrop = (index) => {
        const from = dragIndexRef.current;
        dragIndexRef.current = null;
        setDragOverIndex(null);
        if (from === null || from === index) return;

        if (isEditing) {
            const ids = secondaryExisting.map((img) => img._id);
            const [moved] = ids.splice(from, 1);
            ids.splice(index, 0, moved);
            const primary = (images || []).find((img) => img.is_primary);
            const fullOrder = primary ? [primary._id, ...ids] : ids;
            reorderProductImages(productId, fullOrder).then((result) => {
                if (result?.success) onGalleryUpdated?.(result.data);
            });
        } else {
            const next = extraFiles.slice();
            const [moved] = next.splice(from, 1);
            next.splice(index, 0, moved);
            onExtraFilesChange(next);
        }
    };

    const pendingUploadEntries = Object.entries(busyKeys).filter(([key]) => key.startsWith("upload-"));

    return (
        <div className="space-y-3">
            <div className="relative">
                <Upload
                    listType="picture"
                    maxCount={1}
                    beforeUpload={() => false}
                    onChange={onImageChange}
                    showUploadList={false}
                    className="product-image-upload block w-full"
                >
                    <PhotoDropZone
                        imageUrl={imageUrl}
                        title={t("products.upload_image_hint")}
                        subtitle={t("products.upload_image_size_hint")}
                    />
                </Upload>
                {imageUrl && (
                    <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white">
                        {t("products.primary_image_badge")}
                    </span>
                )}
                {isEditing && primaryImage && (
                    <Popconfirm
                        title={t("common.warning")}
                        onConfirm={() => handleDeleteExisting(primaryImage._id)}
                        okText={t("common.yes")}
                        cancelText={t("common.no")}
                    >
                        <button
                            type="button"
                            disabled={Boolean(busyKeys[primaryImage._id])}
                            className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/70"
                        >
                            {busyKeys[primaryImage._id] ? (
                                <LoadingOutlined className="text-xs" />
                            ) : (
                                <DeleteOutlined className="text-xs" />
                            )}
                        </button>
                    </Popconfirm>
                )}
            </div>

            <div className="flex flex-wrap gap-2">
                {isEditing
                    ? secondaryExisting.map((img, index) => (
                          <Thumbnail
                              key={img._id}
                              url={img.url}
                              index={index}
                              busy={Boolean(busyKeys[img._id])}
                              canSetPrimary
                              isDragOver={dragOverIndex === index}
                              onDragStart={handleDragStart}
                              onDragOver={handleDragOver}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                              onSetPrimary={() => handleSetPrimary(img._id)}
                              onDelete={() => handleDeleteExisting(img._id)}
                              t={t}
                          />
                      ))
                    : extraFiles.map((file, index) => (
                          <Thumbnail
                              key={index}
                              url={getObjectUrl(file)}
                              index={index}
                              busy={false}
                              canSetPrimary={false}
                              isDragOver={dragOverIndex === index}
                              onDragStart={handleDragStart}
                              onDragOver={handleDragOver}
                              onDragLeave={handleDragLeave}
                              onDrop={handleDrop}
                              onDelete={() => handleDeleteStaged(index)}
                              t={t}
                          />
                      ))}

                {pendingUploadEntries.map(([key, progress]) => (
                    <div
                        key={key}
                        className="flex h-20 w-20 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-muted)]"
                    >
                        <LoadingOutlined />
                        {typeof progress === "number" && (
                            <span className="text-[10px]">{progress}%</span>
                        )}
                    </div>
                ))}

                {!atMax && (
                    <Upload
                        multiple
                        beforeUpload={() => false}
                        showUploadList={false}
                        onChange={handlePickExtra}
                    >
                        <AddTile t={t} />
                    </Upload>
                )}
            </div>

            {atMax && (
                <p className="text-xs text-[var(--ohnix-text-dim)]">
                    {t("products.max_images_reached", { max: MAX_PRODUCT_IMAGES })}
                </p>
            )}
        </div>
    );
};

export default ProductImagesUpload;
