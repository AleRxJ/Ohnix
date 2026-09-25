import { useEffect, useState } from "react";
import { Alert, Button, Col, DatePicker, Drawer, Row, Table, Tag, Tooltip } from "antd";
import { CalendarOutlined, DownloadOutlined, WarningOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import * as XLSX from "xlsx";
import toast from "react-hot-toast";
import StatCard from "../dashboard/StatCard";
import EmptyState from "../common/EmptyState";
import { accountingService } from "../../services/accountingService";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";

const { RangePicker } = DatePicker;

const exportSheet = (filename, name, rows) => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));
    XLSX.writeFile(workbook, filename);
};

// Kardex valorizado vs. cuenta 1435 - backend:
// Backend/services/inventoryValuation.service.js. Clicking a product opens
// its kardex (opening balance, every movement, running quantity/value).
const InventoryValuationTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [asOf, setAsOf] = useState(dayjs());
    const [report, setReport] = useState(null);
    const [loading, setLoading] = useState(false);
    const [kardexProduct, setKardexProduct] = useState(null);
    const [kardexRange, setKardexRange] = useState([dayjs().startOf("month"), dayjs()]);
    const [kardex, setKardex] = useState(null);
    const [kardexLoading, setKardexLoading] = useState(false);

    const load = async (date = asOf) => {
        setLoading(true);
        try { setReport((await accountingService.getInventoryValuation({ as_of: date.endOf("day").toISOString() }))?.data || null); }
        catch { toast.error(t("accounting.failed")); }
        finally { setLoading(false); }
    };
    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const loadKardex = async (product, range = kardexRange) => {
        setKardexLoading(true);
        try { setKardex((await accountingService.getProductKardex(product.product_id, { from: range[0].startOf("day").toISOString(), to: range[1].endOf("day").toISOString() }))?.data || null); }
        catch { toast.error(t("accounting.failed")); }
        finally { setKardexLoading(false); }
    };
    const openKardex = (product) => { setKardexProduct(product); setKardex(null); loadKardex(product); };

    const exportValuation = () => exportSheet(`inventario-valorizado-${asOf.format("YYYY-MM-DD")}.xlsx`, t("accounting.inventory_title"), [
        [t("accounting.inventory_col_code"), t("accounting.inventory_col_product"), t("accounting.inventory_col_quantity"), t("accounting.inventory_col_average_cost"), t("accounting.inventory_col_value")],
        ...report.products.map((p) => [p.code || "", p.name, p.quantity, p.average_cost, p.value]),
        [],
        [t("accounting.inventory_value"), "", "", "", report.inventory_value],
        [t("accounting.inventory_ledger"), "", "", "", report.ledger_balance],
        [t("accounting.inventory_difference"), "", "", "", report.difference],
    ]);
    const exportKardex = () => exportSheet(`kardex-${kardex.product.code || kardex.product.name}-${kardexRange[0].format("YYYY-MM-DD")}_${kardexRange[1].format("YYYY-MM-DD")}.xlsx`, "Kardex", [
        [t("finance.col_date"), t("accounting.kardex_col_movement"), t("accounting.kardex_col_location"), t("accounting.kardex_col_in"), t("accounting.kardex_col_out"), t("accounting.kardex_col_unit_cost"), t("accounting.kardex_col_value_delta"), t("accounting.kardex_col_balance_qty"), t("accounting.kardex_col_balance_value")],
        [kardexRange[0].format("DD/MM/YYYY"), t("accounting.kardex_opening"), "", "", "", "", "", kardex.opening_quantity, kardex.opening_value],
        ...kardex.rows.map((r) => [dayjs(r.date).format("DD/MM/YYYY HH:mm"), r.reason || r.source_type, r.point_of_sale?.name || "", r.quantity_in || "", r.quantity_out || "", r.unit_cost ?? "", r.value_delta ?? "", r.balance_quantity, r.balance_value]),
    ]);

    const balanced = report && Math.abs(report.difference) < 0.5;
    return <>
        <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.inventory_intro_title")} description={t("accounting.inventory_intro_desc")} />
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <DatePicker value={asOf} onChange={(value) => { const next = value || dayjs(); setAsOf(next); load(next); }} format="DD/MM/YYYY" allowClear={false} />
            <Button type="primary" icon={<CalendarOutlined />} loading={loading} onClick={() => load()}>{t("reports.refresh_report")}</Button>
            <Button icon={<DownloadOutlined />} disabled={!report?.products?.length} onClick={exportValuation}>{t("reports.export_to_excel")}</Button>
        </div>
        {report && <>
            <Row gutter={[12, 12]} className="mb-4">
                <Col xs={24} sm={8}><StatCard title={t("accounting.inventory_value")} value={report.inventory_value} formatter={formatCurrency} /></Col>
                <Col xs={24} sm={8}><StatCard title={t("accounting.inventory_ledger")} value={report.ledger_balance} formatter={formatCurrency} /></Col>
                <Col xs={24} sm={8}><StatCard title={t("accounting.inventory_difference")} value={report.difference} formatter={formatCurrency} valueStyle={{ fontWeight: 700, color: balanced ? "var(--ohnix-status-success)" : "var(--ohnix-status-warning)" }} /></Col>
            </Row>
            {!balanced && <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.inventory_difference_help")} />}
            {report.unvalued_products > 0 && <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("accounting.inventory_unvalued_help", { count: report.unvalued_products })} />}
        </>}
        <Table
            className="module-dark-table"
            loading={loading}
            rowKey="product_id"
            dataSource={report?.products || []}
            pagination={{ pageSize: 15 }}
            scroll={{ x: "max-content" }}
            onRow={(row) => ({ onClick: () => openKardex(row), className: "cursor-pointer" })}
            locale={{ emptyText: <EmptyState compact title={t("accounting.inventory_empty")} /> }}
            columns={[
                { title: t("accounting.inventory_col_product"), render: (_, row) => <div><strong>{row.name}</strong>{row.code && <small className="block text-[var(--ohnix-text-dim)]">{row.code}</small>}</div> },
                { title: t("accounting.inventory_col_quantity"), dataIndex: "quantity", align: "right" },
                { title: t("accounting.inventory_col_average_cost"), dataIndex: "average_cost", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.inventory_col_value"), dataIndex: "value", align: "right", render: (v, row) => <span className="inline-flex items-center gap-1">{row.unvalued && <Tooltip title={t("accounting.inventory_unvalued_row")}><WarningOutlined className="text-[var(--ohnix-status-warning)]" /></Tooltip>}{formatCurrency(v)}</span> },
            ]}
        />
        <Drawer title={kardexProduct ? t("accounting.kardex_title", { name: kardexProduct.name }) : ""} open={Boolean(kardexProduct)} onClose={() => setKardexProduct(null)} width={960}>
            <div className="flex flex-col sm:flex-row gap-2 mb-4">
                <RangePicker value={kardexRange} allowClear={false} format="DD/MM/YYYY" onChange={(value) => { if (!value) return; setKardexRange(value); loadKardex(kardexProduct, value); }} />
                <Button icon={<DownloadOutlined />} disabled={!kardex} onClick={exportKardex}>{t("reports.export_to_excel")}</Button>
            </div>
            {kardex && (
                <div className="flex flex-wrap gap-2 mb-4">
                    <Tag className="m-0">{t("accounting.kardex_opening")}: {kardex.opening_quantity} · {formatCurrency(kardex.opening_value)}</Tag>
                    <Tag className="m-0" color="green">{t("accounting.kardex_col_in")}: {kardex.total_in}</Tag>
                    <Tag className="m-0" color="orange">{t("accounting.kardex_col_out")}: {kardex.total_out}</Tag>
                    <Tag className="m-0" color="blue">{t("accounting.kardex_closing")}: {kardex.closing_quantity} · {formatCurrency(kardex.closing_value)}</Tag>
                </div>
            )}
            <Table
                className="module-dark-table"
                loading={kardexLoading}
                size="small"
                rowKey="id"
                dataSource={kardex?.rows || []}
                pagination={{ pageSize: 20 }}
                scroll={{ x: "max-content" }}
                columns={[
                    { title: t("finance.col_date"), dataIndex: "date", render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm") },
                    { title: t("accounting.kardex_col_movement"), render: (_, r) => <div>{r.reason || r.source_type}<small className="block text-[var(--ohnix-text-dim)]">{r.point_of_sale?.name}</small></div> },
                    { title: t("accounting.kardex_col_in"), dataIndex: "quantity_in", align: "right", render: (v) => v || "" },
                    { title: t("accounting.kardex_col_out"), dataIndex: "quantity_out", align: "right", render: (v) => v || "" },
                    { title: t("accounting.kardex_col_unit_cost"), dataIndex: "unit_cost", align: "right", render: (v) => v === null ? "—" : formatCurrency(v) },
                    { title: t("accounting.kardex_col_value_delta"), dataIndex: "value_delta", align: "right", render: (v) => v === null ? "—" : formatCurrency(v) },
                    { title: t("accounting.kardex_col_balance_qty"), dataIndex: "balance_quantity", align: "right" },
                    { title: t("accounting.kardex_col_balance_value"), dataIndex: "balance_value", align: "right", render: (v) => formatCurrency(v) },
                ]}
            />
        </Drawer>
    </>;
};

export default InventoryValuationTab;
