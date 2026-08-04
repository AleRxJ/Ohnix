/* eslint-disable react/prop-types */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Button,
    Drawer,
    Divider,
    Empty,
    Input,
    Table,
    Tooltip,
    message,
} from "antd";
import {
    CheckCircleOutlined,
    ClockCircleOutlined,
    CopyOutlined,
    DownloadOutlined,
    FileTextOutlined,
    QrcodeOutlined,
    ReloadOutlined,
    SearchOutlined,
    WarningOutlined,
} from "@ant-design/icons";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { api } from "../api/api";
import PageHeader from "../components/common/PageHeader";
import StatCard from "../components/dashboard/StatCard";
import { useCurrency } from "../context/CurrencyContext";

const STATUS_META = {
    accepted: { color: "var(--ohnix-accent-2)", label: "Aceptado" },
    submitted: { color: "var(--ohnix-status-purple)", label: "Enviado" },
    issuing: { color: "var(--ohnix-status-purple)", label: "Emitiendo" },
    rejected: { color: "var(--ohnix-status-rose)", label: "Rechazado" },
    error: { color: "var(--ohnix-status-rose)", label: "Con error" },
    cancelled: { color: "var(--ohnix-text-dim)", label: "Cancelado" },
    draft: { color: "var(--ohnix-status-amber)", label: "Borrador" },
};

const STATUS_ALL = "all";
const STATUS_FILTERS = [STATUS_ALL, "draft", "issuing", "submitted", "accepted", "rejected", "error", "cancelled"];
const ATTENTION_STATUSES = new Set(["error", "rejected"]);

const SPARK_PALETTE = ["var(--ohnix-accent-2)", "var(--ohnix-status-purple)", "var(--ohnix-status-rose)"];

// Genera una serie temporal estable por seed (id o referencia).
const buildSparkSeries = (rows) => {
    const seedFromKey = (key) => {
        let h = 0;
        for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) >>> 0;
        return () => {
            h = (h * 1664525 + 1013904223) >>> 0;
            return (h % 1000) / 1000;
        };
    };
    return rows.slice(0, 18).reverse().map((row, idx) => {
        const rnd = seedFromKey(row.id || row.referenceCode || String(idx));
        return { name: idx, count: Math.round(rnd() * 60 + 18) };
    });
};

const useCountUp = (target, duration = 900) => {
    const [value, setValue] = useState(0);
    useEffect(() => {
        const from = 0;
        const to = Number(target) || 0;
        if (from === to) {
            setValue(to);
            return undefined;
        }
        let cancelled = false;
        let startTs = null;
        let frame = 0;
        const step = (ts) => {
            if (cancelled) return;
            if (startTs === null) startTs = ts;
            const progress = Math.min((ts - startTs) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(from + (to - from) * eased));
            if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => {
            cancelled = true;
            if (frame) cancelAnimationFrame(frame);
        };
    }, [target, duration]);
    return value;
};

const MetricCard = ({ label, value, icon, color, hint }) => {
    const animated = useCountUp(value);
    return (
        <StatCard
            title={label}
            value={animated}
            icon={icon}
            valueStyle={{ color, fontSize: "32px", fontWeight: 700 }}
            description={hint}
            className="!border-white/10"
        />
    );
};

const StatusPill = ({ status }) => {
    const meta = STATUS_META[status] || { color: "var(--ohnix-text-dim)", label: status };
    return (
        <span
            className="status-pill"
            style={{ color: meta.color, background: `${meta.color}18`, border: `1px solid ${meta.color}33` }}
        >
            <span className={`status-dot status-dot--${status}`} />
            {meta.label}
        </span>
    );
};

const CufeCell = ({ cufe }) => {
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
            () => message.error("No se pudo copiar el CUFE")
        );
    };

    if (!cufe) {
        return <span className="text-xs italic text-[#8B98A0]">Aún no disponible</span>;
    }
    const truncated = `${cufe.slice(0, 14)}…`;
    return (
        <Tooltip title={<span className="font-mono text-xs break-all">{cufe}</span>} placement="topLeft">
            <span
                className="cufe-cell font-mono text-xs text-[#D4DBDF]"
                onClick={handleCopy}
                role="button"
                tabIndex={0}
            >
                {truncated}
                <CopyOutlined className="text-[10px] text-[#29D8D5]" />
                {copied && <span className="copy-feedback absolute -translate-y-3 text-[10px] font-semibold text-[#44F3F0]">Copiado</span>}
            </span>
        </Tooltip>
    );
};

const Sparkline = ({ rows, color }) => {
    const data = useMemo(() => buildSparkSeries(rows), [rows]);
    if (!data.length) return <div className="sparkline-shell" />;
    const gradId = `spark-grad-${color.replace(/[^a-z0-9]/gi, "")}`;
    return (
        <div className="sparkline-shell">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 2, left: 0, right: 0, bottom: 2 }}>
                    <defs>
                        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={color} stopOpacity={0.6} />
                            <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>
                    <Area
                        type="monotone"
                        dataKey="count"
                        stroke={color}
                        strokeWidth={1.6}
                        fill={`url(#${gradId})`}
                        dot={false}
                        isAnimationActive
                        animationDuration={900}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

const TimelineNode = ({ label, when, active, isLast }) => (
    <div className="relative pl-8 pb-5 last:pb-0">
        <span className={`dian-timeline__node ${active ? "" : "dian-timeline__node--pending"}`} style={{ top: 4 }} />
        {!isLast && (
            <span className="absolute left-[15px] top-[18px] bottom-0 w-px bg-gradient-to-b from-[#29D8D5]/60 to-white/5" />
        )}
        <div className={`text-sm font-semibold ${active ? "text-white" : "text-[#8B98A0]"}`}>{label}</div>
        <div className="text-xs text-[#A9B3B8]">{when || "Pendiente"}</div>
    </div>
);

const InfoCard = ({ label, value, mono = false }) => (
    <div className="module-shell rounded-2xl p-4">
        <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8B98A0]">{label}</div>
        <div className={`mt-1 break-all text-sm text-white ${mono ? "font-mono" : "font-semibold"}`}>
            {value || "—"}
        </div>
    </div>
);

const SupportButton = ({ url, kind, size = "large" }) => {
    const present = Boolean(url);
    const isPdf = kind === "pdf";
    const label = isPdf ? "Descargar PDF" : "Ver XML";
    const icon = isPdf ? <DownloadOutlined /> : <FileTextOutlined />;
    const baseClass = "!h-12 !rounded-2xl";
    if (!present) {
        return <Button disabled className={baseClass}>{`${kind.toUpperCase()} no disponible`}</Button>;
    }
    const colorClass = isPdf
        ? "!border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0] hover:!shadow-[0_0_24px_rgba(41,216,213,0.25)]"
        : "!border-white/15 !bg-white/5 !text-white hover:!border-[#29D8D5]/45";
    return (
        <Button
            icon={icon}
            href={url}
            target="_blank"
            size={size}
            className={`${baseClass} ${colorClass}`}
        >
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

const InvoiceDetailDrawer = ({ invoice, onClose }) => {
    if (!invoice) return null;
    const issuedAt = invoice.issuedAt ? new Date(invoice.issuedAt) : null;
    const sentStatuses = ["submitted", "accepted", "rejected", "error"];
    return (
        <Drawer
            open={Boolean(invoice)}
            onClose={onClose}
            width={typeof window !== "undefined" && window.innerWidth < 768 ? "100%" : 540}
            className="dian-drawer"
            title={
                <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-white">Detalle del documento</span>
                    <StatusPill status={invoice.status} />
                </div>
            }
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" },
                header: {
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(8,8,8,0.98))",
                },
                body: {
                    background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
                    padding: "22px",
                },
            }}
        >
            <div className="space-y-5">
                <div className="relative overflow-hidden rounded-3xl border border-[#29D8D5]/25 bg-[radial-gradient(circle_at_90%_0%,rgba(41,216,213,.22),transparent_45%),rgba(255,255,255,0.03)] p-5">
                    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full border border-[#44F3F0]/20 animate-glow-pulse" />
                    <div className="mb-2 inline-flex items-center gap-2 text-[10px] font-bold tracking-[.22em] text-[#44F3F0]">
                        <QrcodeOutlined /> FACTUS · DIAN
                    </div>
                    <div className="text-2xl font-bold text-white">{invoice.invoiceNumber || invoice.referenceCode}</div>
                    <div className="mt-1 text-xs text-[#A9B3B8]">Orden · {invoice.order?.invoiceNo || "—"}</div>

                    <Divider style={{ borderColor: "rgba(255,255,255,0.08)", margin: "18px 0 14px" }} />

                    <div className="dian-timeline">
                        <TimelineNode label="Documento generado" when={issuedAt ? issuedAt.toLocaleString("es-CO") : "Generado"} active />
                        <TimelineNode
                            label="Enviado a la DIAN"
                            when={sentStatuses.includes(invoice.status)
                                ? (issuedAt ? new Date(issuedAt.getTime() + 30 * 1000).toLocaleString("es-CO") : "Enviado")
                                : null}
                            active={sentStatuses.includes(invoice.status)}
                        />
                        <TimelineNode
                            label="Respuesta DIAN"
                            when={invoice.status === "accepted" ? "Aceptado" : invoice.status === "rejected" ? "Rechazado" : null}
                            active={["accepted", "rejected"].includes(invoice.status)}
                            isLast
                        />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <InfoCard label="Cliente" value={invoice.order?.customerName} />
                    <InfoCard label="Orden Ohnix" value={invoice.order?.invoiceNo} />
                </div>

                <div className="module-shell rounded-2xl p-4">
                    <div className="flex items-center justify-between">
                        <div className="text-[10px] font-bold uppercase tracking-[.18em] text-[#8B98A0]">CUFE</div>
                        {invoice.cufe && (
                            <Tooltip title="Copiar CUFE">
                                <Button
                                    size="small"
                                    type="text"
                                    icon={<CopyOutlined />}
                                    onClick={async () => {
                                        const ok = await copyToClipboard(invoice.cufe);
                                        if (ok) message.success("CUFE copiado");
                                        else message.error("No se pudo copiar el CUFE");
                                    }}
                                    className="!text-[#44F3F0]"
                                />
                            </Tooltip>
                        )}
                    </div>
                    <div className={`mt-1 break-all text-xs text-white ${invoice.cufe ? "font-mono" : "italic text-[#8B98A0]"}`}>
                        {invoice.cufe || "Aún no disponible"}
                    </div>
                </div>

                <InfoCard
                    label="Fecha de emisión"
                    value={issuedAt ? issuedAt.toLocaleString("es-CO") : "Pendiente"}
                    mono={false}
                />

                <div className="grid grid-cols-2 gap-3">
                    <SupportButton kind="pdf" url={invoice.pdfUrl} />
                    <SupportButton kind="xml" url={invoice.xmlUrl} />
                </div>

                {invoice.errorMessage && (
                    <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 p-4 text-sm text-rose-200">
                        <div className="mb-1 flex items-center gap-2 font-semibold">
                            <WarningOutlined /> Detalle del error
                        </div>
                        <div>{invoice.errorMessage}</div>
                    </div>
                )}
            </div>
        </Drawer>
    );
};

const ElectronicInvoices = () => {
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(STATUS_ALL);
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const { formatCurrency } = useCurrency();

    const load = useCallback(async () => {
        try {
            setLoading(true);
            const params = {};
            if (status && status !== STATUS_ALL) params.status = status;
            if (search) params.search = search;
            const { data } = await api.get("/electronic-invoices", { params });
            setItems(data.data || []);
        } catch {
            message.error("No fue posible sincronizar los documentos");
        } finally {
            setLoading(false);
        }
    }, [status, search]);

    useEffect(() => {
        load();
    }, [load]);

    const metrics = useMemo(() => {
        const counts = { all: 0, accepted: 0, attention: 0, total: 0 };
        const accepted = [];
        const attention = [];
        for (const key of Object.keys(STATUS_META)) counts[key] = 0;
        for (const i of items) {
            counts.all += 1;
            if (STATUS_META[i.status] !== undefined) counts[i.status] += 1;
            if (i.status === "accepted") {
                counts.accepted += 1;
                accepted.push(i);
            }
            if (ATTENTION_STATUSES.has(i.status)) {
                counts.attention += 1;
                attention.push(i);
            }
            counts.total += Number(i.order?.total ?? i.total ?? 0) || 0;
        }
        // Sparkline usa los primeros 18; calculamos slices estables aquí.
        return {
            counts,
            totalAmount: counts.total,
            acceptedRows: accepted.slice(0, 18),
            attentionRows: attention.slice(0, 18),
            allRows: items.slice(0, 18),
        };
    }, [items]);

    const columns = useMemo(
        () => [
            {
                title: "Documento",
                render: (_, row) => (
                    <div className="flex items-center gap-3">
                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#29D8D5]/25 to-[#44F3F0]/5 text-[#44F3F0] animate-glow-pulse">
                            <FileTextOutlined />
                        </span>
                        <div className="min-w-0">
                            <div className="truncate font-semibold text-white">{row.invoiceNumber || row.referenceCode}</div>
                            <div className="text-xs text-[#8B98A0]">Orden · {row.order?.invoiceNo || "—"}</div>
                        </div>
                    </div>
                ),
            },
            {
                title: "Adquirente",
                render: (_, row) => (
                    <div className="min-w-0">
                        <div className="truncate text-sm text-[#D4DBDF]">{row.order?.customerName || "—"}</div>
                        <div className="truncate text-xs text-[#8B98A0]">{row.order?.customerTaxId || ""}</div>
                    </div>
                ),
            },
            {
                title: "Monto",
                render: (_, row) => (
                    <div className="text-sm font-semibold text-white">
                        {formatCurrency(Number(row.order?.total ?? row.total ?? 0))}
                    </div>
                ),
                width: 140,
            },
            {
                title: "Estado DIAN",
                dataIndex: "status",
                render: (value) => <StatusPill status={value} />,
                width: 180,
            },
            {
                title: "CUFE",
                dataIndex: "cufe",
                render: (value) => <CufeCell cufe={value} />,
                width: 160,
            },
            {
                title: "Emitida",
                render: (_, row) =>
                    row.issuedAt ? (
                        <div className="text-xs text-[#D4DBDF]">
                            {new Date(row.issuedAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })}
                        </div>
                    ) : (
                        <span className="text-xs italic text-[#8B98A0]">Pendiente</span>
                    ),
                width: 160,
            },
            {
                title: "Soportes",
                render: (_, row) => (
                    <div className="flex gap-2">
                        {row.pdfUrl ? (
                            <Tooltip title="PDF">
                                <Button
                                    size="small"
                                    icon={<DownloadOutlined />}
                                    href={row.pdfUrl}
                                    target="_blank"
                                    onClick={(e) => e.stopPropagation()}
                                    className="!border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0]"
                                />
                            </Tooltip>
                        ) : null}
                        {row.xmlUrl ? (
                            <Tooltip title="XML">
                                <Button
                                    size="small"
                                    icon={<FileTextOutlined />}
                                    href={row.xmlUrl}
                                    target="_blank"
                                    onClick={(e) => e.stopPropagation()}
                                    className="!border-white/15 !bg-white/5 !text-white"
                                />
                            </Tooltip>
                        ) : null}
                    </div>
                ),
                width: 110,
            },
        ],
        [formatCurrency]
    );

    const headerSubtitle = useMemo(() => {
        const { counts } = metrics;
        return (
            <span>
                El pulso de tu facturación electrónica, en un solo lugar.{" "}
                {counts.accepted > 0 && (
                    <span className="text-[#44F3F0] font-semibold">{counts.accepted} aceptados</span>
                )}
                {counts.accepted > 0 && counts.attention > 0 ? " · " : ""}
                {counts.attention > 0 && <span className="text-rose-300 font-semibold">{counts.attention} por revisar</span>}
            </span>
        );
    }, [metrics]);

    const metricCards = useMemo(
        () => [
            {
                label: "Documentos",
                value: metrics.counts.all,
                icon: <FileTextOutlined />,
                color: "var(--ohnix-status-purple)",
                hint: "Total emitidos en el sistema",
                sparkRows: metrics.allRows,
                sparkColor: SPARK_PALETTE[1],
                stagger: "stagger-1",
            },
            {
                label: "Aceptados DIAN",
                value: metrics.counts.accepted,
                icon: <CheckCircleOutlined />,
                color: "var(--ohnix-accent-2)",
                hint: "Validados por la DIAN",
                sparkRows: metrics.acceptedRows,
                sparkColor: SPARK_PALETTE[0],
                stagger: "stagger-2",
            },
            {
                label: "Requieren atención",
                value: metrics.counts.attention,
                icon: <WarningOutlined />,
                color: "var(--ohnix-status-rose)",
                hint: "Errores o rechazos a revisar",
                sparkRows: metrics.attentionRows,
                sparkColor: SPARK_PALETTE[2],
                stagger: "stagger-3",
            },
        ],
        [metrics]
    );

    const statusCounts = metrics.counts;

    return (
        <div className="p-5 sm:p-7 lg:p-9 text-white">
            <PageHeader
                title="Centro de documentos"
                subtitle={headerSubtitle}
                icon={<FileTextOutlined />}
                actionIcon={<ReloadOutlined />}
                actionText={loading ? "Sincronizando" : "Sincronizar"}
                onActionClick={load}
            />

            <section className="mb-6 grid gap-3 sm:grid-cols-3">
                {metricCards.map((m) => (
                    <div key={m.label} className={m.stagger}>
                        <MetricCard label={m.label} value={m.value} icon={m.icon} color={m.color} hint={m.hint} />
                        <div className="-mt-2 px-2">
                            <Sparkline rows={m.sparkRows} color={m.sparkColor} />
                        </div>
                    </div>
                ))}
            </section>

            <section className="module-shell rounded-3xl p-4 sm:p-5 surface-shine">
                <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                        {STATUS_FILTERS.map((key) => {
                            const isActive = status === key;
                            const label = key === STATUS_ALL ? "Todos" : STATUS_META[key]?.label || key;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setStatus(key)}
                                    className={`invoice-filter-chip ${isActive ? "invoice-filter-chip--active" : ""}`}
                                >
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
                            placeholder="Busca por referencia, número o CUFE"
                            size="large"
                            className="auth-ohnix-input w-full sm:w-[300px]"
                            allowClear
                        />
                        <Button
                            onClick={load}
                            size="large"
                            className="!border-[#29D8D5]/35 !bg-[#29D8D5]/10 !text-[#44F3F0] hover:!shadow-[0_0_24px_rgba(41,216,213,0.25)]"
                        >
                            Buscar
                        </Button>
                    </div>
                </div>

                <div className="mb-4 hidden gap-3 md:grid md:grid-cols-3">
                    <div className="rounded-2xl border border-white/8 bg-white/[.03] p-3">
                        <div className="text-xs text-[#A9B3B8]">Total facturado</div>
                        <div className="text-lg font-bold text-white">{formatCurrency(metrics.totalAmount)}</div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[.03] p-3">
                        <div className="text-xs text-[#A9B3B8]">Tasa de aceptación</div>
                        <div className="text-lg font-bold text-[#44F3F0]">
                            {metrics.counts.all ? `${Math.round((metrics.counts.accepted / metrics.counts.all) * 100)}%` : "—"}
                        </div>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[.03] p-3">
                        <div className="text-xs text-[#A9B3B8]">Última sincronización</div>
                        <div className="text-sm font-semibold text-white">
                            <ClockCircleOutlined className="mr-1 text-[#29D8D5]" />
                            {new Date().toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                    </div>
                </div>

                <div className="hidden lg:block rounded-2xl border border-white/8 overflow-hidden">
                    <Table
                        locale={{
                            emptyText: (
                                <Empty
                                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                                    description={<span className="text-[#A9B3B8]">Aún no hay documentos electrónicos</span>}
                                />
                            ),
                        }}
                        rowKey="id"
                        loading={loading}
                        dataSource={items}
                        columns={columns}
                        onRow={(record) => ({
                            onClick: () => setSelected(record),
                            className: "cursor-pointer transition-colors",
                        })}
                        pagination={{ pageSize: 10, showTotal: (total) => `${total} documento(s)` }}
                        className="invoice-premium-table"
                    />
                </div>

                <div className="grid gap-3 lg:hidden">
                    {loading ? (
                        <div className="text-center text-[#A9B3B8] py-10">Cargando documentos…</div>
                    ) : items.length === 0 ? (
                        <div className="text-center text-[#A9B3B8] py-10">Aún no hay documentos electrónicos</div>
                    ) : (
                        items.map((row) => (
                            <button
                                key={row.id}
                                type="button"
                                onClick={() => setSelected(row)}
                                className="invoice-mobile-card text-left"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-3">
                                        <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#29D8D5]/25 bg-gradient-to-br from-[#29D8D5]/25 to-[#44F3F0]/5 text-[#44F3F0]">
                                            <FileTextOutlined />
                                        </span>
                                        <div>
                                            <div className="font-semibold text-white">{row.invoiceNumber || row.referenceCode}</div>
                                            <div className="text-xs text-[#A9B3B8]">{row.order?.customerName || "—"}</div>
                                        </div>
                                    </div>
                                    <StatusPill status={row.status} />
                                </div>
                                <div className="mt-3 flex items-center justify-between text-xs">
                                    <div className="text-[#A9B3B8]">Monto</div>
                                    <div className="font-semibold text-white">{formatCurrency(Number(row.order?.total ?? row.total ?? 0))}</div>
                                </div>
                                <div className="mt-1 flex items-center justify-between text-xs">
                                    <div className="text-[#A9B3B8]">CUFE</div>
                                    <CufeCell cufe={row.cufe} />
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </section>

            <InvoiceDetailDrawer invoice={selected} onClose={() => setSelected(null)} />
        </div>
    );
};

export default ElectronicInvoices;
