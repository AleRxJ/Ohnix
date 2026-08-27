/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, Drawer, Divider, Empty, Input, Table, Tooltip, message } from "antd";
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CopyOutlined,
    DownloadOutlined,
    FileTextOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    SearchOutlined,
    SyncOutlined,
    UndoOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import { purchaseSupportDocumentService } from "../services/purchaseSupportDocumentService";
import PageHeader from "../components/common/PageHeader";
import StatCard from "../components/dashboard/StatCard";
import useI18n from "../hooks/useI18n";
import useIsMobile from "../hooks/useIsMobile";
import { resolveApiErrorMessage } from "../utils/apiError";

// Same reasoning as ElectronicInvoices.jsx's PLAN_GATE_CODE_MESSAGES -
// purchaseSupportDocument.service.js's own ensureElectronicInvoicingPlan
// copy throws the same English-by-design, code-tagged error.
const PLAN_GATE_CODE_MESSAGES = { electronic_invoicing_plan_required: "fiscal_setup.plan_required" };
import useCountUp from "../hooks/useCountUp";

// Purchase-side mirror of ElectronicInvoices.jsx, for Documento Soporte (DIAN
// type "05", itcycle-api-dian only) - no credit-note equivalent exists for
// this document type, so that section is dropped entirely.

const STATUS_COLORS = {
    accepted: "var(--ohnix-accent-2)",
    submitted: "var(--ohnix-status-purple)",
    issuing: "var(--ohnix-status-purple)",
    rejected: "var(--ohnix-status-rose)",
    error: "var(--ohnix-status-rose)",
    cancelled: "var(--ohnix-text-dim)",
    draft: "var(--ohnix-status-amber)",
    contingency: "var(--ohnix-status-amber)",
};

const STATUS_ALL = "all";
const STATUS_FILTERS = [STATUS_ALL, "draft", "issuing", "submitted", "accepted", "rejected", "error", "cancelled", "contingency"];
const ATTENTION_STATUSES = new Set(["error", "rejected"]);
const RETRYABLE_STATUSES = new Set(["error", "rejected"]);
const SYNCABLE_STATUSES = new Set(["issuing", "submitted", "contingency"]);

const MetricCard = ({ label, value, icon, color, hint }) => {
    const animated = useCountUp(value);
    return (
        <StatCard
            title={label}
            value={animated}
            icon={icon}
            valueStyle={{ color, fontSize: "32px", fontWeight: 700 }}
            description={hint}
            className="!border-[var(--ohnix-line-4)]"
        />
    );
};

const StatusPill = ({ status }) => {
    const { t } = useI18n();
    const color = STATUS_COLORS[status] || "var(--ohnix-text-dim)";
    const label = t(`purchase_support_documents.status.${status}`, { defaultValue: status });
    return (
        <span className="status-pill" style={{ color, background: `${color}18`, border: `1px solid ${color}33` }}>
            <span className={`status-dot status-dot--${status}`} />
            {label}
        </span>
    );
};

const CufeCell = ({ cufe }) => {
    const { t } = useI18n();
    const [copied, setCopied] = useState(false);
    const timerRef = useRef(null);

    useEffect(() => () => {
        if (timerRef.current) clearTimeout(timerRef.current);
    }, []);

    const handleCopy = (e) => {
        e.stopPropagation();
        if (!cufe) return;
        navigator.clipboard?.writeText(cufe).then(
            () => {
                setCopied(true);
                if (timerRef.current) clearTimeout(timerRef.current);
                timerRef.current = setTimeout(() => setCopied(false), 1100);
            },
            () => message.error(t("purchase_support_documents.cufe_copy_error"))
        );
    };

    if (!cufe) {
        return <span className="text-xs italic text-[var(--ohnix-text-dim)]">{t("purchase_support_documents.cufe_not_available")}</span>;
    }
    const truncated = `${cufe.slice(0, 14)}…`;
    return (
        <Tooltip title={<span className="font-mono text-xs break-all">{cufe}</span>} placement="topLeft">
            <span className="cufe-cell font-mono text-xs text-[var(--ohnix-text-soft)]" onClick={handleCopy} role="button" tabIndex={0}>
                {truncated}
                <CopyOutlined className="text-[10px] text-[#29D8D5]" />
                {copied && <span className="copy-feedback absolute -translate-y-3 text-[10px] font-semibold text-[#44F3F0]">{t("purchase_support_documents.cufe_copied")}</span>}
            </span>
        </Tooltip>
    );
};

const TimelineNode = ({ label, when, active, isLast }) => {
    const { t } = useI18n();
    return (
        <div className="relative pl-8 pb-5 last:pb-0">
            <span className={`dian-timeline__node ${active ? "" : "dian-timeline__node--pending"}`} style={{ top: 4 }} />
            {!isLast && <span className="absolute left-[15px] top-[18px] bottom-0 w-px bg-gradient-to-b from-[#29D8D5]/60 to-[var(--ohnix-line-2)]" />}
            <div className={`text-sm font-semibold ${active ? "text-[var(--ohnix-text-primary)]" : "text-[var(--ohnix-text-dim)]"}`}>{label}</div>
            <div className="text-xs text-[var(--ohnix-text-muted)]">{when || t("purchase_support_documents.drawer.pending")}</div>
        </div>
    );
};

const InfoCard = ({ label, value, mono = false }) => (
    <div className="module-shell rounded-2xl p-4">
        <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--ohnix-text-dim)]">{label}</div>
        <div className={`mt-1 break-all text-sm text-[var(--ohnix-text-primary)] ${mono ? "font-mono" : "font-semibold"}`}>{value || "—"}</div>
    </div>
);

const SupportButton = ({ url, kind }) => {
    const { t } = useI18n();
    const present = Boolean(url);
    const isPdf = kind === "pdf";
    const label = isPdf ? t("purchase_support_documents.support.download_pdf") : t("purchase_support_documents.support.view_xml");
    const icon = isPdf ? <DownloadOutlined /> : <FileTextOutlined />;
    const baseClass = "!h-12 !rounded-2xl";
    if (!present) {
        return <Button disabled className={baseClass}>{t("purchase_support_documents.support.not_available", { kind: kind.toUpperCase() })}</Button>;
    }
    const colorClass = isPdf
        ? "!border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0] hover:!shadow-[0_0_24px_rgba(41,216,213,0.25)]"
        : "!border-[var(--ohnix-line-6)] !bg-[var(--ohnix-line-2)] !text-[var(--ohnix-text-primary)] hover:!border-[#29D8D5]/45";
    return (
        <Button icon={icon} href={url} target="_blank" size="large" className={`${baseClass} ${colorClass}`}>
            {label}
        </Button>
    );
};

const copyToClipboard = async (value) => {
    try {
        await navigator.clipboard?.writeText(value);
        return true;
    } catch {
        return false;
    }
};

const EVENT_LABEL_KEYS = {
    issuance_claimed: "purchase_support_documents.timeline.issuance_claimed",
    provider_response: "purchase_support_documents.timeline.provider_response",
    provider_error: "purchase_support_documents.timeline.provider_error",
    manual_sync: "purchase_support_documents.timeline.manual_sync",
    manual_sync_error: "purchase_support_documents.timeline.manual_sync_error",
};

const DocumentDetailDrawer = ({ document, onClose, onRetry, onSync, retrying, syncing }) => {
    const { t } = useI18n();
    const isMobile = useIsMobile();
    if (!document) return null;
    const issuedAt = document.issuedAt ? new Date(document.issuedAt) : null;
    const events = Array.isArray(document.events) ? document.events : [];

    return (
        <Drawer
            open={Boolean(document)}
            onClose={onClose}
            width={isMobile ? "100%" : 540}
            className="dian-drawer"
            title={
                <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">{t("purchase_support_documents.drawer.title")}</span>
                    <StatusPill status={document.status} />
                </div>
            }
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" },
                header: { borderBottom: "1px solid var(--ohnix-line-3)", background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))" },
                body: { background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))", padding: "22px" },
            }}
        >
            <div className="space-y-5">
                <div className="relative overflow-hidden rounded-3xl border border-[#29D8D5]/25 bg-[radial-gradient(circle_at_90%_0%,rgba(41,216,213,.22),transparent_45%),var(--ohnix-line-1)] p-5">
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-[#44F3F0]/20 animate-glow-pulse" />
                    <div className="mb-2 inline-flex items-center gap-2 text-[10px] font-bold tracking-[.22em] text-[#44F3F0]">
                        <QrcodeOutlined /> ITCYCLE · DIAN
                    </div>
                    <div className="text-2xl font-bold text-[var(--ohnix-text-primary)]">{document.documentNumber || document.referenceCode}</div>
                    <div className="mt-1 text-xs text-[var(--ohnix-text-muted)]">{t("purchase_support_documents.table.purchase_prefix")} {document.purchase?.purchaseNo || "—"}</div>

                    <Divider style={{ borderColor: "var(--ohnix-line-3)", margin: "18px 0 14px" }} />

                    <div className="dian-timeline">
                        {events.length === 0 ? (
                            <TimelineNode label={t("purchase_support_documents.timeline.empty")} when={null} active={false} isLast />
                        ) : (
                            events.map((event, idx) => (
                                <TimelineNode
                                    key={event.id}
                                    label={t(EVENT_LABEL_KEYS[event.eventType] || event.eventType, { defaultValue: event.eventType })}
                                    when={new Date(event.createdAt).toLocaleString("es-CO")}
                                    active
                                    isLast={idx === events.length - 1}
                                />
                            ))
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <InfoCard label={t("purchase_support_documents.drawer.supplier")} value={document.purchase?.supplierName} />
                    <InfoCard label={t("purchase_support_documents.drawer.purchase")} value={document.purchase?.purchaseNo} />
                </div>

                <div className="module-shell rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[var(--ohnix-text-dim)]">CUFE/CUDE</div>
                        {document.cufe && (
                            <Tooltip title={t("common.copy")}>
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<CopyOutlined />}
                                    onClick={async () => {
                                        const ok = await copyToClipboard(document.cufe);
                                        if (ok) message.success(t("purchase_support_documents.cufe_copied"));
                                        else message.error(t("purchase_support_documents.cufe_copy_error"));
                                    }}
                                    className="!text-[#44F3F0]"
                                />
                            </Tooltip>
                        )}
                    </div>
                    <div className={`mt-1 break-all text-xs text-[var(--ohnix-text-primary)] ${document.cufe ? "font-mono" : "italic text-[var(--ohnix-text-dim)]"}`}>
                        {document.cufe || t("purchase_support_documents.cufe_not_available")}
                    </div>
                </div>

                <InfoCard
                    label={t("purchase_support_documents.drawer.issued_at")}
                    value={issuedAt ? issuedAt.toLocaleString("es-CO") : t("purchase_support_documents.drawer.pending")}
                />

                <div className="grid grid-cols-2 gap-3">
                    <SupportButton kind="pdf" url={document.pdfUrl} />
                    <SupportButton kind="xml" url={document.xmlUrl} />
                </div>

                {RETRYABLE_STATUSES.has(document.status) && (
                    <Button
                        block
                        icon={<UndoOutlined />}
                        loading={retrying}
                        onClick={() => onRetry(document.purchaseId, document.id)}
                        className="!h-12 !rounded-2xl !border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0]"
                    >
                        {t("purchase_support_documents.retry_action")}
                    </Button>
                )}

                {SYNCABLE_STATUSES.has(document.status) && (
                    <Button
                        block
                        icon={<SyncOutlined spin={syncing} />}
                        loading={syncing}
                        onClick={() => onSync(document.purchaseId, document.id)}
                        className="!h-12 !rounded-2xl !border-[var(--ohnix-line-6)] !bg-[var(--ohnix-line-2)] !text-[var(--ohnix-text-primary)]"
                    >
                        {t("purchase_support_documents.sync_action")}
                    </Button>
                )}

                {document.status === "contingency" && (
                    <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 p-4 text-sm text-amber-100">
                        <div className="mb-1 flex items-center gap-2 font-semibold">
                            <WarningOutlined /> {t("purchase_support_documents.status.contingency")}
                        </div>
                        <div>{t("purchase_support_documents.contingency_hint")}</div>
                    </div>
                )}

                {document.errorMessage && (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-200">
                        <div className="mb-1 flex items-center gap-2 font-semibold">
                            <WarningOutlined /> {t("purchase_support_documents.drawer.error_detail")}
                        </div>
                        <div>{document.errorMessage}</div>
                    </div>
                )}
            </div>
        </Drawer>
    );
};

const PurchaseSupportDocuments = () => {
    const { t } = useI18n();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(STATUS_ALL);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const [retryingId, setRetryingId] = useState(null);
    const [syncingId, setSyncingId] = useState(null);
    // `items` is the full, unpaginated list (the desktop table below pages
    // it client-side) - the mobile card list used to render every single
    // document at once regardless of how many existed.
    const MOBILE_PAGE_SIZE = 15;
    const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_PAGE_SIZE);
    useEffect(() => {
        setMobileVisibleCount(MOBILE_PAGE_SIZE);
    }, [items]);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (status && status !== STATUS_ALL) params.status = status;
            if (search) params.search = search;
            const { data } = await purchaseSupportDocumentService.list(params);
            const rows = data || [];
            setItems(rows);
            return rows;
        } catch {
            message.error(t("purchase_support_documents.list_load_error"));
            return [];
        } finally {
            setLoading(false);
        }
    }, [status, search, t]);

    useEffect(() => {
        load();
    }, [load]);

    const refreshSelected = async (documentId) => {
        const rows = await load();
        const updated = rows.find((row) => row.id === documentId);
        if (updated) setSelected(updated);
    };

    const handleRetry = async (purchaseId, documentId) => {
        setRetryingId(purchaseId);
        try {
            await purchaseSupportDocumentService.retry(purchaseId);
            message.success(t("purchase_support_documents.retry_success"));
            await refreshSelected(documentId);
        } catch (error) {
            message.error(resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "purchase_support_documents.retry_error"));
        } finally {
            setRetryingId(null);
        }
    };

    const handleSync = async (purchaseId, documentId) => {
        setSyncingId(purchaseId);
        try {
            await purchaseSupportDocumentService.sync(purchaseId);
            message.success(t("purchase_support_documents.sync_success"));
            await refreshSelected(documentId);
        } catch (error) {
            message.error(resolveApiErrorMessage(error, t, PLAN_GATE_CODE_MESSAGES, "purchase_support_documents.sync_error_action"));
        } finally {
            setSyncingId(null);
        }
    };

    const metrics = useMemo(() => {
        const counts = { all: 0, accepted: 0, attention: 0 };
        for (const key of Object.keys(STATUS_COLORS)) counts[key] = 0;
        for (const i of items) {
            counts.all += 1;
            if (STATUS_COLORS[i.status] !== undefined) counts[i.status] += 1;
            if (i.status === "accepted") counts.accepted += 1;
            if (ATTENTION_STATUSES.has(i.status)) counts.attention += 1;
        }
        return { counts };
    }, [items]);

    const columns = useMemo(
        () => [
            {
                title: t("purchase_support_documents.table.document"),
                render: (_, row) => (
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#29D8D5]/25 to-[#44F3F0]/5 text-[#44F3F0] animate-glow-pulse">
                            <FileTextOutlined />
                        </span>
                        <div className="min-w-0">
                            <div className="truncate font-semibold text-[var(--ohnix-text-primary)]">{row.documentNumber || row.referenceCode}</div>
                            <div className="text-xs text-[var(--ohnix-text-dim)]">{t("purchase_support_documents.table.purchase_prefix")} {row.purchase?.purchaseNo || "—"}</div>
                        </div>
                    </div>
                ),
            },
            {
                title: t("purchase_support_documents.table.supplier"),
                render: (_, row) => <div className="truncate text-sm text-[var(--ohnix-text-soft)]">{row.purchase?.supplierName || "—"}</div>,
            },
            {
                title: t("purchase_support_documents.table.status"),
                dataIndex: "status",
                render: (value) => <StatusPill status={value} />,
                width: 180,
            },
            {
                title: t("purchase_support_documents.table.cufe"),
                dataIndex: "cufe",
                render: (value) => <CufeCell cufe={value} />,
                width: 160,
            },
            {
                title: t("purchase_support_documents.table.issued"),
                render: (_, row) =>
                    row.issuedAt ? (
                        <div className="text-xs text-[var(--ohnix-text-soft)]">{new Date(row.issuedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}</div>
                    ) : (
                        <span className="text-xs italic text-[var(--ohnix-text-dim)]">{t("purchase_support_documents.table.pending")}</span>
                    ),
                width: 160,
            },
        ],
        [t]
    );

    const headerSubtitle = useMemo(() => {
        const { counts } = metrics;
        return (
            <span>
                {t("purchase_support_documents.subtitle_base")}{" "}
                {counts.accepted > 0 && <span className="text-[#44F3F0] font-semibold">{t("purchase_support_documents.subtitle_accepted", { count: counts.accepted })}</span>}
                {counts.accepted > 0 && counts.attention > 0 ? " · " : ""}
                {counts.attention > 0 && <span className="text-rose-300 font-semibold">{t("purchase_support_documents.subtitle_attention", { count: counts.attention })}</span>}
            </span>
        );
    }, [metrics, t]);

    const metricCards = useMemo(
        () => [
            { label: t("purchase_support_documents.metrics.documents"), value: metrics.counts.all, icon: <FileTextOutlined />, color: "var(--ohnix-status-purple)", hint: t("purchase_support_documents.metrics.documents_hint") },
            { label: t("purchase_support_documents.metrics.accepted"), value: metrics.counts.accepted, icon: <CheckCircleOutlined />, color: "var(--ohnix-accent-2)", hint: t("purchase_support_documents.metrics.accepted_hint") },
            { label: t("purchase_support_documents.metrics.attention"), value: metrics.counts.attention, icon: <WarningOutlined />, color: "var(--ohnix-status-rose)", hint: t("purchase_support_documents.metrics.attention_hint") },
        ],
        [metrics, t]
    );

    const statusCounts = metrics.counts;

    return (
        <div className="p-5 sm:p-7 lg:p-9 text-[var(--ohnix-text-primary)]">
            <PageHeader
                title={t("purchase_support_documents.title")}
                subtitle={headerSubtitle}
                icon={<FileTextOutlined />}
                actionIcon={<ReloadOutlined />}
                actionText={loading ? t("purchase_support_documents.syncing") : t("purchase_support_documents.sync_action")}
                onActionClick={load}
            />

            <section className="mb-6 grid gap-3 sm:grid-cols-3">
                {metricCards.map((m) => (
                    <div key={m.label}>
                        <MetricCard label={m.label} value={m.value} icon={m.icon} color={m.color} hint={m.hint} />
                    </div>
                ))}
            </section>

            <section className="module-shell rounded-3xl p-4 sm:p-5 surface-shine">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {STATUS_FILTERS.map((key) => {
                            const isActive = status === key;
                            const label = key === STATUS_ALL ? t("purchase_support_documents.filters.all") : t(`purchase_support_documents.status.${key}`, { defaultValue: key });
                            return (
                                <button key={key} type="button" onClick={() => setStatus(key)} className={`invoice-filter-chip ${isActive ? "invoice-filter-chip--active" : ""}`}>
                                    {label}
                                    <span className="invoice-filter-chip__count">{statusCounts[key] ?? 0}</span>
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2">
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onPressEnter={load}
                            prefix={<SearchOutlined className="text-[#29D8D5]" />}
                            placeholder={t("purchase_support_documents.search_placeholder")}
                            size="large"
                            className="auth-ohnix-input w-full sm:w-[300px]"
                            allowClear
                        />
                        <Button onClick={load} size="large" className="!border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0] hover:!shadow-[0_0_24px_rgba(41,216,213,0.25)]">
                            {t("purchase_support_documents.search_button")}
                        </Button>
                    </div>
                </div>

                <div className="mb-4 hidden gap-3 md:grid md:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-line-1)] p-3">
                        <div className="text-xs text-[var(--ohnix-text-muted)]">{t("purchase_support_documents.stats.acceptance_rate")}</div>
                        <div className="text-lg font-bold text-[#44F3F0]">{metrics.counts.all ? `${Math.round((metrics.counts.accepted / metrics.counts.all) * 100)}%` : "—"}</div>
                    </div>
                    <div className="rounded-2xl border border-[var(--ohnix-line-3)] bg-[var(--ohnix-line-1)] p-3">
                        <div className="text-xs text-[var(--ohnix-text-muted)]">{t("purchase_support_documents.stats.last_sync")}</div>
                        <div className="text-sm font-semibold text-[var(--ohnix-text-primary)]">
                            <ClockCircleOutlined className="mr-1 text-[#29D8D5]" />
                            {new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                    </div>
                </div>

                <div className="hidden lg:block rounded-2xl border border-[var(--ohnix-line-3)] overflow-hidden">
                    <Table
                        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={<span className="text-[var(--ohnix-text-muted)]">{t("purchase_support_documents.empty_state")}</span>} /> }}
                        rowKey="id"
                        loading={loading}
                        dataSource={items}
                        columns={columns}
                        onRow={(record) => ({ onClick: () => setSelected(record), className: "cursor-pointer transition-colors" })}
                        pagination={{ pageSize: 10, showTotal: (total) => t("purchase_support_documents.table.documents_total", { count: total }) }}
                        className="invoice-premium-table"
                    />
                </div>

                <div className="grid gap-3 lg:hidden">
                    {loading ? (
                        <div className="text-center text-[var(--ohnix-text-muted)] py-10">{t("purchase_support_documents.loading_documents")}</div>
                    ) : items.length === 0 ? (
                        <div className="text-center text-[var(--ohnix-text-muted)] py-10">{t("purchase_support_documents.empty_state")}</div>
                    ) : (
                        <>
                            {items.slice(0, mobileVisibleCount).map((row) => (
                                <button key={row.id} type="button" onClick={() => setSelected(row)} className="invoice-mobile-card text-left">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-3">
                                            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#29D8D5]/25 to-[#44F3F0]/5 text-[#44F3F0]">
                                                <FileTextOutlined />
                                            </span>
                                            <div>
                                                <div className="font-semibold text-[var(--ohnix-text-primary)]">{row.documentNumber || row.referenceCode}</div>
                                                <div className="text-xs text-[var(--ohnix-text-muted)]">{row.purchase?.supplierName || "—"}</div>
                                            </div>
                                        </div>
                                        <StatusPill status={row.status} />
                                    </div>
                                    <div className="mt-1 flex items-center justify-between text-xs">
                                        <div className="text-[var(--ohnix-text-muted)]">{t("purchase_support_documents.table.cufe")}</div>
                                        <CufeCell cufe={row.cufe} />
                                    </div>
                                </button>
                            ))}
                            {mobileVisibleCount < items.length && (
                                <Button block onClick={() => setMobileVisibleCount((c) => c + MOBILE_PAGE_SIZE)}>
                                    {t("common.load_more")}
                                </Button>
                            )}
                        </>
                    )}
                </div>
            </section>

            <DocumentDetailDrawer
                document={selected}
                onClose={() => setSelected(null)}
                onRetry={handleRetry}
                onSync={handleSync}
                retrying={Boolean(selected && retryingId === selected.purchaseId)}
                syncing={Boolean(selected && syncingId === selected.purchaseId)}
            />
        </div>
    );
};

export default PurchaseSupportDocuments;
