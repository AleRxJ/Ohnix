import React, { useState } from "react";
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
    message,
} from "antd";
import {
    UploadOutlined,
    DownloadOutlined,
    CheckCircleOutlined,
    CloseCircleOutlined,
    FileTextOutlined,
} from "@ant-design/icons";
import { api } from "../../api/api";
import useI18n from "../../hooks/useI18n";

const { Text } = Typography;

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

    const handleFileSelect = (selectedFile) => {
        const isCSV =
            selectedFile.type === "text/csv" ||
            selectedFile.type === "application/vnd.ms-excel" ||
            selectedFile.name.toLowerCase().endsWith(".csv");

        if (!isCSV) {
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
        const exampleCategory = categories[0]?.category_name || "Electronics";
        const exampleUnit = units[0]?.unit_name || "Piece";

        const csvContent = [
            "product_name,product_code,category_name,unit_name,buying_price,selling_price",
            `"Example Product",EX001,"${exampleCategory}","${exampleUnit}",100.00,150.00`,
        ].join("\n");

        const blob = new Blob([csvContent], {
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
                    borderRadius: "20px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
                },
            }}
        >
            <div className="space-y-4 py-2">
                <div className="bg-[#29D8D5]/10 border border-[#29D8D5]/25 rounded-lg p-4">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <Text className="font-semibold !text-[var(--ohnix-text-primary)] block mb-1">
                                {t("products.step_1_download_template")}
                            </Text>
                            <Text className="text-sm !text-[var(--ohnix-text-muted)]">
                                {t("products.template_csv_instruction")}{" "}
                                <Text code className="text-xs">
                                    product_name
                                </Text>
                                ,{" "}
                                <Text code className="text-xs">
                                    product_code
                                </Text>
                                ,{" "}
                                <Text code className="text-xs">
                                    category_name
                                </Text>
                                ,{" "}
                                <Text code className="text-xs">
                                    unit_name
                                </Text>
                                ,{" "}
                                <Text code className="text-xs">
                                    buying_price
                                </Text>
                                ,{" "}
                                <Text code className="text-xs">
                                    selling_price
                                </Text>
                            </Text>
                        </div>
                        <Button
                            icon={<DownloadOutlined />}
                            onClick={handleDownloadTemplate}
                            size="small"
                            className="flex-shrink-0"
                        >
                            {t("products.template")}
                        </Button>
                    </div>
                </div>

                <div>
                    <Text className="font-semibold block mb-2">
                        {t("products.step_2_select_csv")}
                    </Text>
                    <Upload
                        accept=".csv"
                        beforeUpload={handleFileSelect}
                        maxCount={1}
                        showUploadList={false}
                        onRemove={() => setFile(null)}
                    >
                        <Button
                            icon={<UploadOutlined />}
                            size="large"
                            className="w-full"
                        >
                            {file
                                ? `${t("products.selected")}: ${file.name}`
                                : t("products.click_to_select_csv")}
                        </Button>
                    </Upload>
                    {file && (
                        <Text type="secondary" className="text-xs mt-1 block">
                            {(file.size / 1024).toFixed(1)} {t("products.kb_supported_rows")}
                        </Text>
                    )}
                </div>

                {uploading && (
                    <Progress
                        percent={progress}
                        status="active"
                        strokeColor={{ from: "#108ee9", to: "#87d068" }}
                    />
                )}

                {!hasResult && (
                    <Button
                        type="primary"
                        size="large"
                        onClick={handleUpload}
                        loading={uploading}
                        disabled={!file || uploading}
                        className="w-full"
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
                            />
                        )}

                        {partialSuccess && (
                            <Alert
                                type="warning"
                                message={t("products.upload_partial_success", { inserted: result.inserted, failed: result.failed })}
                                showIcon
                            />
                        )}

                        {allFailed && (
                            <Alert
                                type="error"
                                icon={<CloseCircleOutlined />}
                                message={t("products.upload_failed", { count: result.failed })}
                                showIcon
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

                        <div className="flex gap-2 pt-2">
                            <Button
                                onClick={() => {
                                    setFile(null);
                                    setResult(null);
                                    setProgress(0);
                                }}
                                className="flex-1"
                            >
                                {t("products.upload_another_file")}
                            </Button>
                            <Button
                                type="primary"
                                onClick={handleClose}
                                className="flex-1"
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
