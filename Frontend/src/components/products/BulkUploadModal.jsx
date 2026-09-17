import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
    Modal,
    Upload,
    Button,
    Table,
    Typography,
    Alert,
    Progress,
    Tag,
    Divider,
    Collapse,
    message,
} from "antd";
import {
    InboxOutlined,
    DownloadOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    CloseOutlined,
    FileTextOutlined,
} from "@ant-design/icons";
import { api } from "../../api/api";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

// Must mirror REQUIRED_COLUMNS / the optional-column handling in
// Backend/controllers/product.bulk.controller.js.
const REQUIRED_COLUMNS = [
    "product_name",
    "product_code",
    "category_name",
    "unit_name",
    "buying_price",
    "selling_price",
];

const OPTIONAL_COLUMNS = [
    "sku",
    "barcode",
    "brand",
    "status",
    "stock",
    "low_stock_threshold",
    "image_filename",
    "image_url",
    "tax_code",
    "tax_rate",
    "tax_treatment",
    "is_physical",
    "weight_value",
    "weight_unit",
    "height_value",
    "width_value",
    "length_value",
    "dimension_unit",
    "units_per_package",
    "packaging_type",
    "is_fragile",
];

const BulkUploadModal = ({
    visible,
    categories,
    units,
    onClose,
    onComplete,
}) => {
    const [file, setFile] = useState(null);
    const [uploading, setUploading] = useState(false);
    const [result, setResult] = useState(null);
    const [progress, setProgress] = useState(0);
    const { t } = useI18n();

    const hasCategories = categories.length > 0;
    const hasUnits = units.length > 0;
    const missingTaxonomyMessage = !hasCategories && !hasUnits
        ? t("products.bulk_missing_both")
        : !hasCategories
            ? t("products.bulk_missing_categories")
            : !hasUnits
                ? t("products.bulk_missing_units")
                : null;

    const handleFileSelect = (selectedFile) => {
        // Zip mimetypes are reported inconsistently across browsers/OSes
        // (application/zip, application/x-zip-compressed, or even a generic
        // application/octet-stream) - the extension is the reliable check.
        const name = selectedFile.name.toLowerCase();
        const isAccepted =
            selectedFile.type === "text/csv" ||
            selectedFile.type === "application/vnd.ms-excel" ||
            name.endsWith(".csv") ||
            name.endsWith(".zip");

        if (!isAccepted) {
            message.error(t("products.csv_only_accepted"));
            setFile(null);
            return false;
        }

        setFile(selectedFile);
        setResult(null);
        return false;
    };

    const handleUpload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        setUploading(true);
        setProgress(0);

        try {
            const response = await api.post("/products/bulk-upload", formData, {
                headers: { "Content-Type": "multipart/form-data" },
                onUploadProgress: (progressEvent) => {
                    const pct = Math.round(
                        (progressEvent.loaded * 100) / progressEvent.total
                    );
                    setProgress(pct);
                },
            });

            setResult(response.data.data);

            if (response.data.data?.inserted > 0) {
                onComplete();
            }
        } catch (err) {
            const data = err.response?.data;
            if (data?.data) {
                setResult(data.data);
            } else {
                setResult({
                    total: 0,
                    inserted: 0,
                    failed: 1,
                    errors: [
                        {
                            row: "-",
                            product_code: "-",
                            errors: [data?.message || t("products.upload_generic_error")],
                        },
                    ],
                });
            }
        } finally {
            setUploading(false);
        }
    };

    const handleClose = () => {
        setFile(null);
        setResult(null);
        setProgress(0);
        onClose();
    };

    const handleDownloadTemplate = () => {
        // Falls back to an obviously-fake placeholder (not a plausible real
        // category/unit name like the old "Electronics"/"Piece" strings) when
        // the account has none yet - otherwise the template looks valid but
        // every row fails on upload with a "Category/Unit not found" error
        // the user has no way to anticipate.
        const exampleCategory = categories[0]?.category_name || "TU_CATEGORIA";
        const exampleUnit = units[0]?.unit_name || "TU_UNIDAD";

        const columns = [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS];
        const exampleValues = {
            product_name: "Example Product",
            product_code: "EX001",
            category_name: exampleCategory,
            unit_name: exampleUnit,
            buying_price: "100.00",
            selling_price: "150.00",
            sku: "SKU-EX001",
            stock: "10",
            image_filename: "EX001",
        };

        const csvContent = [
            columns.join(","),
            columns.map((col) => `"${exampleValues[col] || ""}"`).join(","),
        ].join("\n");

        const blob = new Blob(["﻿" + csvContent], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "products_template.csv";
        a.click();
        URL.revokeObjectURL(url);
    };

    const errorColumns = [
        {
            title: t("products.bulk_col_row"),
            dataIndex: "row",
            width: 70,
            render: (val) => (
                <Text className="!text-[var(--ohnix-text-muted)]">#{val}</Text>
            ),
        },
        {
            title: t("products.bulk_col_product_code"),
            dataIndex: "product_code",
            width: 120,
            render: (val) => <Text code>{val}</Text>,
        },
        {
            title: t("products.bulk_col_errors"),
            dataIndex: "errors",
            render: (errs) => (
                <div className="flex flex-col gap-1">
                    {errs.map((e, i) => (
                        <Text key={i} className="text-xs !text-red-400">
                            • {e}
                        </Text>
                    ))}
                </div>
            ),
        },
    ];

    const hasResult = result !== null;
    const allSucceeded = hasResult && result.failed === 0;
    const partialSuccess =
        hasResult && result.inserted > 0 && result.failed > 0;
    const allFailed = hasResult && result.inserted === 0;

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <FileTextOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {t("products.bulk_product_upload")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={handleClose}
            width={720}
            footer={null}
            destroyOnClose
            className="bulk-upload-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            <div className="space-y-4 py-2">
                {missingTaxonomyMessage && (
                    <Alert
                        type="warning"
                        showIcon
                        className="dark-alert dark-alert-amber"
                        message={missingTaxonomyMessage}
                        description={
                            <div className="flex flex-wrap items-center gap-2">
                                <span>{t("products.bulk_missing_taxonomy_suffix")}</span>
                                <Link
                                    to="/categories"
                                    onClick={handleClose}
                                    className="font-semibold !text-[#44F3F0] hover:!text-[#29D8D5] whitespace-nowrap"
                                >
                                    {t("products.bulk_missing_taxonomy_cta")} →
                                </Link>
                            </div>
                        }
                    />
                )}

                <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#29D8D5] to-[#44F3F0] text-xs font-bold text-[#021314]">
                            1
                        </div>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <Text className="font-semibold !text-[var(--ohnix-text-primary)]">
                                    {t("products.step_1_download_template")}
                                </Text>
                                <Button
                                    icon={<DownloadOutlined />}
                                    onClick={handleDownloadTemplate}
                                    size="small"
                                    className="flex-shrink-0"
                                >
                                    {t("products.template")}
                                </Button>
                            </div>
                            <Text className="text-sm !text-[var(--ohnix-text-muted)] block mt-1 mb-2.5">
                                {t("products.template_csv_instruction")}
                            </Text>
                            <div className="flex flex-wrap gap-1.5">
                                {REQUIRED_COLUMNS.map((col) => (
                                    <span
                                        key={col}
                                        className="rounded-md border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] px-2 py-0.5 font-mono text-[11px] text-[#44F3F0]"
                                    >
                                        {col}
                                    </span>
                                ))}
                            </div>
                            <Text className="text-xs !text-[var(--ohnix-text-dim)] block mt-2.5">
                                {t("products.bulk_taxonomy_match_hint")}
                            </Text>
                            <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#29D8D5]/25 bg-[#29D8D5]/[0.06] px-3 py-2.5">
                                <span className="text-sm leading-none mt-0.5">🖼️</span>
                                <Text className="text-xs !text-[var(--ohnix-text-muted)]">
                                    {t("products.bulk_image_instruction")}
                                </Text>
                            </div>
                            <Collapse
                                ghost
                                size="small"
                                className="bulk-optional-fields-collapse mt-2.5 -mx-1"
                                items={[
                                    {
                                        key: "optional",
                                        label: (
                                            <Text className="text-xs font-medium !text-[var(--ohnix-text-muted)]">
                                                {t("products.bulk_optional_fields_toggle")}
                                            </Text>
                                        ),
                                        children: (
                                            <div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {OPTIONAL_COLUMNS.map((col) => (
                                                        <span
                                                            key={col}
                                                            className="rounded-md border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-4)] px-2 py-0.5 font-mono text-[11px] text-[var(--ohnix-text-muted)]"
                                                        >
                                                            {col}
                                                        </span>
                                                    ))}
                                                </div>
                                                <Text className="text-xs !text-[var(--ohnix-text-dim)] block mt-2">
                                                    {t("products.bulk_optional_fields_hint")}
                                                </Text>
                                            </div>
                                        ),
                                    },
                                ]}
                            />
                        </div>
                    </div>
                </div>

                <div className="rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4">
                    <div className="flex items-start gap-3">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#29D8D5] to-[#44F3F0] text-xs font-bold text-[#021314]">
                            2
                        </div>
                        <div className="min-w-0 flex-1">
                            <Text className="font-semibold !text-[var(--ohnix-text-primary)] block mb-2.5">
                                {t("products.step_2_select_csv")}
                            </Text>

                            {file ? (
                                <div className="flex items-center gap-3 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-4)] px-3.5 py-3">
                                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                                        <FileTextOutlined className="text-[#44F3F0]" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <Text className="!text-[var(--ohnix-text-primary)] text-sm font-medium block truncate">
                                            {file.name}
                                        </Text>
                                        <Text className="!text-[var(--ohnix-text-muted)] text-xs block">
                                            {(file.size / 1024).toFixed(1)} {t("products.kb_supported_rows")}
                                        </Text>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setFile(null);
                                            setResult(null);
                                        }}
                                        aria-label={t("products.remove_file")}
                                        className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[var(--ohnix-text-dim)] transition-colors duration-200 hover:bg-[var(--ohnix-line-3)] hover:text-white"
                                    >
                                        <CloseOutlined className="text-xs" />
                                    </button>
                                </div>
                            ) : (
                                <Upload.Dragger
                                    accept=".csv,.zip"
                                    beforeUpload={handleFileSelect}
                                    maxCount={1}
                                    showUploadList={false}
                                    className="csv-dropzone"
                                >
                                    <div className="csv-dropzone-inner flex w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--ohnix-line-5)] bg-[var(--ohnix-surface-4)] px-6 py-7 text-center transition-all duration-300 hover:border-[#29D8D5]/60 hover:bg-[var(--ohnix-hover-overlay)]">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-[#29D8D5] to-[#44F3F0] shadow-[0_8px_20px_rgba(41,216,213,0.35)]">
                                            <InboxOutlined className="text-lg text-[#021314]" />
                                        </div>
                                        <Text className="!text-[var(--ohnix-text-primary)] text-sm font-semibold">
                                            {t("products.drag_drop_csv_hint")}
                                        </Text>
                                        <Text className="!text-[var(--ohnix-text-muted)] text-xs">
                                            {t("products.csv_dropzone_subtitle")}
                                        </Text>
                                    </div>
                                </Upload.Dragger>
                            )}
                        </div>
                    </div>
                </div>

                {uploading && (
                    <Progress
                        percent={progress}
                        status="active"
                        strokeColor={{ from: "#29D8D5", to: "#44F3F0" }}
                    />
                )}

                {!hasResult && (
                    <Button
                        type="primary"
                        onClick={handleUpload}
                        loading={uploading}
                        disabled={!file || uploading}
                        className="w-full h-10 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                    >
                        {uploading ? t("products.uploading") : t("products.upload_products")}
                    </Button>
                )}

                {hasResult && (
                    <div className="space-y-3">
                        <Divider className="!my-2" />

                        {allSucceeded && (
                            <Alert
                                type="success"
                                icon={<CheckCircleOutlined />}
                                message={t("products.upload_success", { count: result.inserted })}
                                showIcon
                                className="dark-alert dark-alert-teal"
                            />
                        )}

                        {partialSuccess && (
                            <Alert
                                type="warning"
                                message={t("products.upload_partial_success", { inserted: result.inserted, failed: result.failed })}
                                showIcon
                                className="dark-alert dark-alert-amber"
                            />
                        )}

                        {allFailed && (
                            <Alert
                                type="error"
                                icon={<CloseCircleOutlined />}
                                message={t("products.upload_failed", { count: result.failed })}
                                showIcon
                                className="dark-alert dark-alert-rose"
                            />
                        )}

                        <div className="flex gap-2 flex-wrap">
                            <Tag color="cyan">
                                {t("products.total_rows")} {result.total}
                            </Tag>
                            {result.inserted > 0 && (
                                <Tag color="success">
                                    {t("products.inserted")} {result.inserted}
                                </Tag>
                            )}
                            {result.failed > 0 && (
                                <Tag color="error">
                                    {t("products.failed_rows")} {result.failed}
                                </Tag>
                            )}
                        </div>

                        {result.errors?.length > 0 && (
                            <div>
                                <Text className="font-semibold !text-red-400 block mb-2">
                                    {t("products.row_errors", { count: result.errors.length })}
                                </Text>
                                <Table
                                    dataSource={result.errors.map((e, i) => ({
                                        ...e,
                                        key: i,
                                    }))}
                                    columns={errorColumns}
                                    size="small"
                                    pagination={
                                        result.errors.length > 10
                                            ? { pageSize: 10, size: "small" }
                                            : false
                                    }
                                    scroll={{ x: 400 }}
                                    className="module-dark-table border border-[var(--ohnix-line-4)] rounded-lg overflow-hidden"
                                />
                            </div>
                        )}

                        {result.imagesFailed > 0 && (
                            <div>
                                <Alert
                                    type="warning"
                                    showIcon
                                    className="dark-alert dark-alert-amber mb-2"
                                    message={t("products.images_failed_alert", { count: result.imagesFailed })}
                                />
                                <Text className="font-semibold !text-amber-400 block mb-2">
                                    {t("products.image_errors_title", { count: result.imagesFailed })}
                                </Text>
                                <Table
                                    dataSource={result.imageErrors.map((e, i) => ({
                                        ...e,
                                        key: i,
                                    }))}
                                    columns={errorColumns}
                                    size="small"
                                    pagination={
                                        result.imageErrors.length > 10
                                            ? { pageSize: 10, size: "small" }
                                            : false
                                    }
                                    scroll={{ x: 400 }}
                                    className="module-dark-table border border-[var(--ohnix-line-4)] rounded-lg overflow-hidden"
                                />
                            </div>
                        )}

                        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 border-t border-[var(--ohnix-line-4)]">
                            <Button
                                onClick={() => {
                                    setFile(null);
                                    setResult(null);
                                    setProgress(0);
                                }}
                                className="flex-1 h-10 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                            >
                                {t("products.upload_another_file")}
                            </Button>
                            <Button
                                type="primary"
                                onClick={handleClose}
                                className="flex-1 h-10 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                            >
                                {t("products.done")}
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </Modal>
    );
};

export default BulkUploadModal;
