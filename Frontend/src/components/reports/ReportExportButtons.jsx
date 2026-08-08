import React, { useState } from "react";
import { Button, Tooltip } from "antd";
import { FileExcelOutlined, FileTextOutlined, FilePdfOutlined, LockOutlined } from "@ant-design/icons";
import useSubscription from "../../hooks/useSubscription";
import useI18n from "../../hooks/useI18n";

const ReportExportButtons = ({ hasData, onExportCsv, onExportExcel, onExportPdf, className = "" }) => {
    const { can } = useSubscription();
    const { t } = useI18n();
    const [pdfLoading, setPdfLoading] = useState(false);

    const canCsv = can("exportCsv");
    const canExcel = can("exportExcel");
    const canPdf = can("exportPdf");

    const handleExportPdf = async () => {
        if (!onExportPdf) return;
        setPdfLoading(true);
        try {
            await onExportPdf();
        } finally {
            setPdfLoading(false);
        }
    };

    return (
        <div className={`flex flex-col sm:flex-row gap-2 ${className}`}>
            {canCsv ? (
                <Button
                    icon={<FileTextOutlined />}
                    onClick={onExportCsv}
                    disabled={!hasData}
                    className="bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0] w-full sm:w-auto border-0"
                >
                    <span className="hidden sm:inline">{t("reports.export_to_csv")}</span>
                    <span className="sm:hidden">CSV</span>
                </Button>
            ) : (
                <Tooltip title={t("reports.export_csv_locked_tooltip")}>
                    <span>
                        <Button disabled icon={<LockOutlined />} className="w-full sm:w-auto">
                            <span className="hidden sm:inline">{t("reports.export_to_csv")}</span>
                            <span className="sm:hidden">CSV</span>
                        </Button>
                    </span>
                </Tooltip>
            )}

            {canExcel ? (
                <Button
                    icon={<FileExcelOutlined />}
                    onClick={onExportExcel}
                    disabled={!hasData}
                    className="bg-green-500 text-white hover:bg-green-600 w-full sm:w-auto border-0"
                >
                    <span className="hidden sm:inline">{t("reports.export_to_excel")}</span>
                    <span className="sm:hidden">Excel</span>
                </Button>
            ) : (
                <Tooltip title={t("reports.export_excel_locked_tooltip")}>
                    <span>
                        <Button disabled icon={<LockOutlined />} className="w-full sm:w-auto">
                            <span className="hidden sm:inline">{t("reports.export_to_excel")}</span>
                            <span className="sm:hidden">Excel</span>
                        </Button>
                    </span>
                </Tooltip>
            )}

            {onExportPdf && (
                canPdf ? (
                    <Button
                        icon={<FilePdfOutlined />}
                        onClick={handleExportPdf}
                        disabled={!hasData}
                        loading={pdfLoading}
                        className="bg-red-500 text-white hover:bg-red-600 w-full sm:w-auto border-0"
                    >
                        <span className="hidden sm:inline">{t("reports.export_to_pdf")}</span>
                        <span className="sm:hidden">PDF</span>
                    </Button>
                ) : (
                    <Tooltip title={t("reports.export_pdf_locked_tooltip")}>
                        <span>
                            <Button disabled icon={<LockOutlined />} className="w-full sm:w-auto">
                                <span className="hidden sm:inline">{t("reports.export_to_pdf")}</span>
                                <span className="sm:hidden">PDF</span>
                            </Button>
                        </span>
                    </Tooltip>
                )
            )}
        </div>
    );
};

export default ReportExportButtons;
