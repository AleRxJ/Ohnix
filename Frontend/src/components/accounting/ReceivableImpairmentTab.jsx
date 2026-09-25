import { useEffect, useState } from "react";
import { Alert, Button, Col, DatePicker, InputNumber, Popconfirm, Row, Table, Tag } from "antd";
import { CalculatorOutlined, CheckCircleOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import StatCard from "../dashboard/StatCard";
import EmptyState from "../common/EmptyState";
import { accountingService } from "../../services/accountingService";
import { useCurrency } from "../../context/CurrencyContext";
import { useTeam } from "../../context/TeamContext";
import useI18n from "../../hooks/useI18n";
import { resolveApiErrorMessage } from "../../utils/apiError";

const BUCKETS = ["current", "d1_90", "d91_180", "d181_360", "over_360"];
const DEFAULT_RATES = { current: 0, d1_90: 0, d91_180: 5, d181_360: 10, over_360: 15 };
const ERROR_CODES = { impairment_rate_invalid: "accounting.impairment_error_rate", impairment_date_future: "accounting.impairment_error_future", accounting_period_closed: "accounting.error_period_closed" };
const errorMessage = (error, t) => resolveApiErrorMessage(error, t, ERROR_CODES, "accounting.failed");

// Deterioro de cartera - backend: Backend/services/receivableImpairment.service.js.
// Rates per aging bucket are editable per run; defaults are the fiscal
// "método general" (5% / 10% / 15%).
const ReceivableImpairmentTab = () => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const { hasPermission } = useTeam();
    const canAdmin = hasPermission("accounting", "admin");
    const [asOf, setAsOf] = useState(dayjs());
    const [rates, setRates] = useState(DEFAULT_RATES);
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [posting, setPosting] = useState(false);
    const [runs, setRuns] = useState([]);

    const loadRuns = async () => {
        try { setRuns((await accountingService.listImpairmentRuns())?.data || []); } catch { /* list is secondary */ }
    };
    const loadPreview = async () => {
        setLoading(true);
        try {
            const response = await accountingService.previewImpairment({ as_of: asOf.endOf("day").toISOString(), rates });
            setPreview(response?.data || null);
        } catch (error) { toast.error(errorMessage(error, t)); }
        finally { setLoading(false); }
    };
    useEffect(() => { loadPreview(); loadRuns(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const post = async () => {
        setPosting(true);
        try {
            await accountingService.runImpairment({ as_of: asOf.endOf("day").toISOString(), rates });
            toast.success(t("accounting.impairment_posted"));
            await Promise.all([loadPreview(), loadRuns()]);
        } catch (error) { toast.error(errorMessage(error, t)); }
        finally { setPosting(false); }
    };

    const adjustment = preview?.adjustment || 0;
    return <>
        <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("accounting.impairment_intro_title")} description={t("accounting.impairment_intro_desc")} />
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 mb-4">
            <div>
                <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t("accounting.impairment_cutoff")}</label>
                <DatePicker value={asOf} onChange={(value) => { setAsOf(value || dayjs()); setPreview(null); }} format="DD/MM/YYYY" allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), "day")} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 flex-1">
                {BUCKETS.map((bucket) => (
                    <div key={bucket}>
                        <label className="block text-xs text-[var(--ohnix-text-muted)] mb-1">{t(`accounting.impairment_bucket_${bucket}`)}</label>
                        <InputNumber className="w-full" min={0} max={100} value={rates[bucket]} addonAfter="%" onChange={(value) => { setRates((current) => ({ ...current, [bucket]: value ?? 0 })); setPreview(null); }} />
                    </div>
                ))}
            </div>
            <Button icon={<CalculatorOutlined />} loading={loading} onClick={loadPreview}>{t("accounting.vat_preview_cta")}</Button>
        </div>

        {preview && <>
            <Row gutter={[12, 12]} className="mb-4">
                <Col xs={12} lg={6}><StatCard title={t("accounting.impairment_total_receivable")} value={preview.total_receivable} formatter={formatCurrency} /></Col>
                <Col xs={12} lg={6}><StatCard title={t("accounting.impairment_required")} value={preview.required_provision} formatter={formatCurrency} /></Col>
                <Col xs={12} lg={6}><StatCard title={t("accounting.impairment_previous")} value={preview.previous_provision} formatter={formatCurrency} /></Col>
                <Col xs={12} lg={6}><StatCard title={t(adjustment >= 0 ? "accounting.impairment_adjustment_up" : "accounting.impairment_adjustment_down")} value={Math.abs(adjustment)} formatter={formatCurrency} valueStyle={{ fontWeight: 700 }} /></Col>
            </Row>
            <div className="flex flex-wrap gap-2 mb-4">
                {BUCKETS.map((bucket) => <Tag key={bucket} className="m-0">{t(`accounting.impairment_bucket_${bucket}`)}: {formatCurrency(preview.bucket_totals[bucket] || 0)}</Tag>)}
            </div>
            {canAdmin && (
                <div className="flex justify-end mb-4">
                    <Popconfirm title={t("accounting.impairment_confirm_title")} description={t(Math.abs(adjustment) < 0.005 ? "accounting.impairment_confirm_nothing" : adjustment > 0 ? "accounting.impairment_confirm_up" : "accounting.impairment_confirm_down", { amount: formatCurrency(Math.abs(adjustment)) })} okText={t("accounting.impairment_post_cta")} cancelText={t("common.cancel")} onConfirm={post}>
                        <Button type="primary" icon={<CheckCircleOutlined />} loading={posting}>{t("accounting.impairment_post_cta")}</Button>
                    </Popconfirm>
                </div>
            )}
            <Table
                className="module-dark-table mb-6"
                size="small"
                rowKey="id"
                dataSource={preview.documents}
                pagination={{ pageSize: 10 }}
                scroll={{ x: "max-content" }}
                locale={{ emptyText: <EmptyState compact title={t("accounting.impairment_empty")} /> }}
                columns={[
                    { title: t("accounting.impairment_col_document"), render: (_, row) => <div><strong>{row.number}</strong><small className="block text-[var(--ohnix-text-dim)]">{row.customer?.name || t("common.na")}</small></div> },
                    { title: t("accounting.impairment_col_due"), render: (_, row) => dayjs(row.due_date || row.document_date).format("DD/MM/YYYY") },
                    { title: t("accounting.impairment_col_days"), dataIndex: "days_past_due", align: "right" },
                    { title: t("accounting.impairment_col_bucket"), dataIndex: "bucket", render: (value) => <Tag>{t(`accounting.impairment_bucket_${value}`)}</Tag> },
                    { title: t("accounting.impairment_col_pending"), dataIndex: "pending", align: "right", render: (v) => formatCurrency(v) },
                    { title: t("accounting.impairment_col_provision"), dataIndex: "provision", align: "right", render: (v) => formatCurrency(v) },
                ]}
            />
        </>}

        <h4 className="text-xs font-semibold text-[var(--ohnix-text-muted)] mb-3 uppercase tracking-wide">{t("accounting.impairment_history")}</h4>
        <Table
            className="module-dark-table"
            size="small"
            rowKey="_id"
            dataSource={runs}
            pagination={{ pageSize: 5 }}
            locale={{ emptyText: <EmptyState compact title={t("accounting.impairment_history_empty")} /> }}
            columns={[
                { title: t("accounting.impairment_cutoff"), dataIndex: "as_of", render: (v) => dayjs(v).format("DD/MM/YYYY") },
                { title: t("accounting.impairment_required"), dataIndex: "required_provision", align: "right", render: (v) => formatCurrency(v) },
                { title: t("accounting.impairment_col_adjustment"), dataIndex: "adjustment", align: "right", render: (v) => <span className={v > 0 ? "text-[var(--ohnix-status-warning)]" : v < 0 ? "text-[var(--ohnix-status-success)]" : ""}>{v > 0 ? "+" : ""}{formatCurrency(v)}</span> },
                { title: t("accounting.impairment_col_run_at"), dataIndex: "created_at", render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm") },
            ]}
        />
    </>;
};

export default ReceivableImpairmentTab;
