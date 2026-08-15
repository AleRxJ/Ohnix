import * as XLSX from "xlsx";
import { api } from "../api/api";

// CSV/Excel are built entirely client-side from data already on screen, so
// there's no server endpoint actually producing a file to gate the way PDF
// export is gated below - without this, the plan check hiding the button in
// ReportExportButtons.jsx is just UI, trivially bypassed by calling
// downloadCsv/downloadExcel directly (e.g. from devtools). This call throws
// (propagating the 403 from enforcePlanFeature) before any file is built.
const authorizeExport = (feature) => api.get(`/reports/export/${feature}/authorize`);

export const downloadCsv = async (rows, filename) => {
    await authorizeExport("csv");

    const csvContent = rows
        .map((row) => row.map((field) => `"${field ?? ""}"`).join(","))
        .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = "hidden";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
};

export const downloadExcel = async (rows, filename, sheetName = "Report") => {
    await authorizeExport("excel");

    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName.slice(0, 31));
    XLSX.writeFile(workbook, filename);
};

// Unlike CSV/Excel (built entirely client-side from data already on screen),
// the PDF is rendered server-side so it can carry the company's branding
// (see Backend/utils/reportPdf.js) - but the payload is still exactly the
// title/sections the caller already has, not a fresh unfiltered re-query,
// so the file matches whatever's currently filtered/searched. `sections` is
// an array of { heading?, summary?: [[label, value]], table?: {headers, rows} }
// - most reports only need one section, Sales/Purchases need more than one
// table on the same document.
export const downloadPdfReport = async ({ title, subtitle, sections }, filename) => {
    const response = await api.post(
        "/reports/export/pdf",
        { title, subtitle, sections },
        { responseType: "blob" }
    );

    const blob = new Blob([response.data], { type: "application/pdf" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};
