import React, { useEffect, useMemo, useState } from "react";
import { Button, Drawer, Empty, Input, Select, Table, Tag, Typography } from "antd";
import { CheckCircleOutlined, DownloadOutlined, FileTextOutlined, ReloadOutlined, SearchOutlined, WarningOutlined } from "@ant-design/icons";
import { api } from "../api/api";

const { Title, Text } = Typography;
const tone = { accepted: "#44F3F0", submitted: "#7C6AF7", issuing: "#7C6AF7", rejected: "#fb7185", error: "#fb7185", cancelled: "#8B98A0", draft: "#f59e0b" };

const ElectronicInvoices = () => {
    const [items, setItems] = useState([]); const [loading, setLoading] = useState(true);
    const [status, setStatus] = useState(); const [search, setSearch] = useState("");
    const [selected, setSelected] = useState(null);
    const load = async () => { try { setLoading(true); const { data } = await api.get("/electronic-invoices", { params: { ...(status ? { status } : {}), ...(search ? { search } : {}) } }); setItems(data.data || []); } finally { setLoading(false); } };
    useEffect(() => { load(); }, [status]);
    const accepted = items.filter((i) => i.status === "accepted").length;
    const attention = items.filter((i) => ["error", "rejected"].includes(i.status)).length;
    const columns = useMemo(() => [
        { title: "Documento", render: (_, row) => <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#29D8D5]/20 bg-[#29D8D5]/10 text-[#44F3F0]"><FileTextOutlined /></span><div><div className="font-semibold text-white">{row.invoiceNumber || row.referenceCode}</div><div className="text-xs text-[#8B98A0]">Orden · {row.order?.invoiceNo || "—"}</div></div></div> },
        { title: "Adquirente", render: (_, row) => <Text className="text-[#D4DBDF]">{row.order?.customerName || "—"}</Text> },
        { title: "Estado DIAN", dataIndex: "status", render: (value) => <Tag className="!rounded-full !border-0 !px-3 !py-1 !font-medium" style={{ color: tone[value], background: `${tone[value]}18` }}>{value}</Tag> },
        { title: "CUFE", dataIndex: "cufe", render: (value) => <span className="font-mono text-xs text-[#8B98A0]">{value ? `${value.slice(0, 14)}…` : "Aún no disponible"}</span> },
        { title: "Soportes", render: (_, row) => <div className="flex gap-2">{row.pdfUrl && <Button size="small" href={row.pdfUrl} target="_blank">PDF</Button>}{row.xmlUrl && <Button size="small" href={row.xmlUrl} target="_blank">XML</Button>}</div> },
    ], []);
    return <div className="p-5 sm:p-7 lg:p-9 text-white">
        <section className="relative mb-6 overflow-hidden rounded-3xl border border-[#29D8D5]/20 bg-[radial-gradient(circle_at_82%_18%,rgba(41,216,213,.20),transparent_28%),linear-gradient(135deg,#101c20,#090b0c_58%,#111026)] p-6 sm:p-8 shadow-[0_24px_65px_rgba(0,0,0,.38)]">
            <div className="absolute right-[-40px] top-[-60px] h-52 w-52 rounded-full border border-[#44F3F0]/20" />
            <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#29D8D5]/25 bg-[#29D8D5]/10 px-3 py-1 text-xs font-bold tracking-[.16em] text-[#44F3F0]"><FileTextOutlined /> COLOMBIA · DIAN</div><Title level={1} className="!mb-2 !text-3xl sm:!text-4xl !text-white">Centro de documentos</Title><Text className="text-[#A9B3B8]">El pulso de tu facturación electrónica, en un solo lugar.</Text></div><Button icon={<ReloadOutlined />} onClick={load} loading={loading} className="border-[#29D8D5]/35 bg-[#29D8D5]/10 !text-[#44F3F0]">Sincronizar</Button></div>
        </section>
        <div className="mb-6 grid gap-3 sm:grid-cols-3"><Metric label="Documentos" value={items.length} icon={<FileTextOutlined />} color="#7C6AF7" /><Metric label="Aceptados DIAN" value={accepted} icon={<CheckCircleOutlined />} color="#44F3F0" /><Metric label="Requieren atención" value={attention} icon={<WarningOutlined />} color="#fb7185" /></div>
        <section className="rounded-3xl border border-white/10 bg-white/[.025] p-4 sm:p-5"><div className="mb-5 grid gap-3 md:grid-cols-[1fr_190px_auto]"><Input value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={load} prefix={<SearchOutlined className="text-[#29D8D5]" />} placeholder="Busca por referencia, número o CUFE" size="large" className="auth-ohnix-input" /><Select value={status} onChange={setStatus} allowClear placeholder="Todos los estados" size="large" options={["draft","issuing","submitted","accepted","rejected","error","cancelled"].map((value) => ({ value, label: value }))} /><Button onClick={load} size="large" className="border-[#29D8D5]/35 bg-[#29D8D5]/10 !text-[#44F3F0]">Buscar</Button></div>
            <div className="invoice-table overflow-hidden rounded-2xl border border-white/8"><Table locale={{ emptyText: <Empty description={<span className="text-[#A9B3B8]">Aún no hay documentos electrónicos</span>} /> }} rowKey="id" loading={loading} dataSource={items} columns={columns} onRow={(record) => ({ onClick: () => setSelected(record), className: "cursor-pointer" })} pagination={{ pageSize: 10 }} scroll={{ x: 760 }} /></div>
        </section>
        <InvoiceDrawer invoice={selected} onClose={() => setSelected(null)} />
    </div>;
};
const Metric = ({ label, value, icon, color }) => <div className="rounded-2xl border border-white/10 bg-white/[.035] p-4"><div className="mb-4 flex items-center justify-between"><span className="text-sm text-[#A9B3B8]">{label}</span><span className="flex h-9 w-9 items-center justify-center rounded-xl" style={{ color, background: `${color}18` }}>{icon}</span></div><div className="text-3xl font-bold text-white">{value}</div></div>;
const InvoiceDrawer = ({ invoice, onClose }) => <Drawer open={Boolean(invoice)} onClose={onClose} width={typeof window !== "undefined" && window.innerWidth < 768 ? "100%" : 500} title="Detalle del documento" styles={{ content: { background: "linear-gradient(180deg,#101b20,#090a0d)", color: "white" }, header: { background: "transparent", borderBottom: "1px solid rgba(255,255,255,.08)" } }}>
    {invoice && <div className="space-y-5"><div className="rounded-3xl border border-[#29D8D5]/20 bg-[radial-gradient(circle_at_90%_0%,rgba(41,216,213,.18),transparent_45%),rgba(255,255,255,.03)] p-5"><div className="mb-3 text-xs font-bold tracking-[.16em] text-[#44F3F0]">FACTUS · DIAN</div><div className="text-2xl font-bold text-white">{invoice.invoiceNumber || invoice.referenceCode}</div><div className="mt-3"><Tag className="!rounded-full !border-0 !px-3 !py-1" style={{ color: tone[invoice.status], background: `${tone[invoice.status]}18` }}>{invoice.status}</Tag></div></div><Detail label="Cliente" value={invoice.order?.customerName} /><Detail label="Orden Ohnix" value={invoice.order?.invoiceNo} /><Detail label="CUFE" value={invoice.cufe || "Aún no disponible"} mono /><Detail label="Emitida" value={invoice.issuedAt ? new Date(invoice.issuedAt).toLocaleString("es-CO") : "Pendiente"} /><div className="grid grid-cols-2 gap-3">{invoice.pdfUrl && <Button icon={<DownloadOutlined />} href={invoice.pdfUrl} target="_blank" className="h-11 border-[#29D8D5]/35 bg-[#29D8D5]/10 !text-[#44F3F0]">PDF</Button>}{invoice.xmlUrl && <Button icon={<DownloadOutlined />} href={invoice.xmlUrl} target="_blank" className="h-11 border-white/15 bg-white/5 !text-white">XML</Button>}</div>{invoice.errorMessage && <div className="rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-sm text-rose-200">{invoice.errorMessage}</div>}</div>}
</Drawer>;
const Detail = ({ label, value, mono = false }) => <div className="rounded-2xl border border-white/8 bg-white/[.035] p-4"><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-[#8B98A0]">{label}</div><div className={`break-all text-sm text-white ${mono ? "font-mono" : ""}`}>{value || "—"}</div></div>;
export default ElectronicInvoices;
