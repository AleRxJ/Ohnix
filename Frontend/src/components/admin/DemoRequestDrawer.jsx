import { useContext, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Alert, Button, Descriptions, Drawer, Empty, Input, Popconfirm, Select, Spin, Table, Tag } from "antd";
import { CheckCircleOutlined, DownloadOutlined, LoginOutlined, MailOutlined, RocketOutlined, SearchOutlined, WhatsAppOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import AuthContext from "../../context/AuthContext";
import useI18n from "../../hooks/useI18n";
import { adminService } from "../../services/adminService";
import { DEMO_STATUSES } from "./demoRequestStatus";
const CATALOG_FIELDS = ["name", "code", "category", "unit", "price", "cost", "taxRate", "barcode", "brand", "stock"];

const money = (value) => `$ ${new Intl.NumberFormat("es-CO").format(value ?? 0)}`;

const Section = ({ title, children }) => (
    <section className="space-y-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-[var(--ohnix-text-dim)]">{title}</h3>
        {children}
    </section>
);

const DemoRequestDrawer = ({ request, open, online, onClose, onUpdate, fetchDetail, previewImport, provision, sendAccess, downloadCatalogFile }) => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { applySession } = useContext(AuthContext);
    const [detail, setDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [notes, setNotes] = useState("");
    const [mapping, setMapping] = useState({});
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(null); // "preview" | "provision" | "access"

    const id = request?._id;

    useEffect(() => {
        setNotes(request?.internal_notes || "");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);

    useEffect(() => {
        setDetail(null);
        setPreview(null);
        setMapping({});
        if (!open || !id || !online) return;
        let cancelled = false;
        setLoadingDetail(true);
        fetchDetail(id).then((data) => {
            if (cancelled) return;
            setDetail(data);
            setMapping(data?.catalog?.suggested_mapping || {});
            setLoadingDetail(false);
        });
        return () => {
            cancelled = true;
        };
    }, [open, id, online, fetchDetail]);

    if (!request) return null;

    const catalog = detail?.catalog;
    const provisioned = !!request.provisioned_user_id;
    const phoneDigits = `${request.phone || ""}`.replace(/\D/g, "");
    const waNumber = phoneDigits.length === 10 && phoneDigits.startsWith("3") ? `57${phoneDigits}` : phoneDigits;
    const whatsappUrl = `https://wa.me/${waNumber}?text=${encodeURIComponent(
        t("admin_demo_requests.whatsapp_greeting", { name: request.name.split(" ")[0], company: request.company_name })
    )}`;
    const source = [request.utm_source, request.utm_medium, request.utm_campaign, request.utm_content].filter(Boolean).join(" / ");
    const importSummary = request.import_summary;

    const issueText = (issue) => t(`admin_demo_requests.issue_${issue.message}`, { row: issue.row, detail: issue.detail });

    const runPreview = async () => {
        setBusy("preview");
        setPreview(await previewImport(id, mapping));
        setBusy(null);
    };

    const runProvision = async () => {
        setBusy("provision");
        await provision(id, catalog ? mapping : undefined);
        setBusy(null);
    };

    const runSendAccess = async () => {
        setBusy("access");
        const updated = await sendAccess(id);
        if (updated) toast.success(t("admin_demo_requests.access_sent", { date: new Date(updated.access_sent_at).toLocaleString() }));
        setBusy(null);
    };

    const impersonate = async () => {
        try {
            const response = await adminService.impersonateUser(request.provisioned_user_id);
            applySession(response.data.user, response.data.accessToken);
            navigate("/dashboard");
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        }
    };

    const headerOptions = [
        { value: "", label: t("admin_demo_requests.no_column") },
        ...(catalog?.headers || []).map((header, index) => ({ value: index, label: header })),
    ];

    return (
        <Drawer
            open={open}
            onClose={onClose}
            width={Math.min(760, typeof window !== "undefined" ? window.innerWidth : 760)}
            title={t("admin_demo_requests.detail_title", { company: request.company_name })}
            extra={
                <Select
                    value={request.status}
                    onChange={(status) => onUpdate(id, { status })}
                    options={DEMO_STATUSES.map((status) => ({ value: status, label: t(`admin_demo_requests.status_${status}`) }))}
                    style={{ width: 150 }}
                />
            }
            destroyOnClose
        >
            {/* pb-24: keeps the last actions clear of the floating assistant button. */}
            <div className="space-y-8 pb-24">
                {!online && <Alert type="warning" showIcon message={t("admin_demo_requests.offline_actions")} />}

                <Section title={t("admin_demo_requests.contact_section")}>
                    <Descriptions column={1} size="small" bordered>
                        <Descriptions.Item label={t("demo_booking.name_label")}>{request.name}</Descriptions.Item>
                        <Descriptions.Item label={t("demo_booking.phone_label")}>
                            <div className="flex flex-wrap items-center gap-3">
                                {request.phone}
                                <a href={whatsappUrl} target="_blank" rel="noopener noreferrer">
                                    <Button size="small" icon={<WhatsAppOutlined />}>{t("admin_demo_requests.open_whatsapp")}</Button>
                                </a>
                            </div>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("demo_booking.email_label")}>
                            <a href={`mailto:${request.email}`}>{request.email}</a>
                        </Descriptions.Item>
                        <Descriptions.Item label={t("admin_demo_requests.col_preferred")}>
                            {request.preferred_date || "—"}
                            {request.preferred_slot ? ` · ${t(`admin_demo_requests.slot_${request.preferred_slot}`)}` : ""}
                        </Descriptions.Item>
                        <Descriptions.Item label={t("admin_demo_requests.business")}>
                            {request.business_type ? t(`demo_booking.business_${request.business_type}`) : "—"}
                        </Descriptions.Item>
                        <Descriptions.Item label={t("admin_demo_requests.product_count")}>{request.product_count_range || "—"}</Descriptions.Item>
                        <Descriptions.Item label={t("admin_demo_requests.source")}>{source || "—"}</Descriptions.Item>
                        {request.message && <Descriptions.Item label={t("admin_demo_requests.message")}>{request.message}</Descriptions.Item>}
                    </Descriptions>
                </Section>

                <Section title={t("admin_demo_requests.internal_notes")}>
                    <Input.TextArea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t("admin_demo_requests.notes_placeholder")} maxLength={5000} />
                    <Button onClick={() => onUpdate(id, { internal_notes: notes })} disabled={notes === (request.internal_notes || "")}>
                        {t("admin_demo_requests.save_notes")}
                    </Button>
                </Section>

                <Section title={t("admin_demo_requests.catalog_section")}>
                    {!request.has_catalog_file && !request.catalog_row_count ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t("admin_demo_requests.no_catalog")} />
                    ) : (
                        <div className="space-y-4">
                            {request.has_catalog_file && (
                                <Button icon={<DownloadOutlined />} disabled={!online} onClick={() => downloadCatalogFile(id, request.catalog_file_name)}>
                                    {t("admin_demo_requests.download_file")} ({request.catalog_file_name})
                                </Button>
                            )}
                            {loadingDetail && <Spin />}
                            {detail && !catalog && <Alert type="warning" showIcon message={t("admin_demo_requests.catalog_unparsed")} />}
                            {catalog && !provisioned && (
                                <>
                                    <div>
                                        <p className="font-semibold">{t("admin_demo_requests.mapping_title")}</p>
                                        <p className="text-sm text-[var(--ohnix-text-muted)]">{t("admin_demo_requests.mapping_hint")}</p>
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                        {CATALOG_FIELDS.map((field) => (
                                            <label key={field} className="flex flex-col gap-1 text-sm">
                                                <span className="text-[var(--ohnix-text-muted)]">{t(`admin_demo_requests.field_${field}`)}</span>
                                                <Select
                                                    value={mapping[field] ?? ""}
                                                    onChange={(value) => {
                                                        setMapping((prev) => ({ ...prev, [field]: value === "" ? null : value }));
                                                        setPreview(null);
                                                    }}
                                                    options={headerOptions}
                                                />
                                            </label>
                                        ))}
                                    </div>
                                    <Table
                                        size="small"
                                        className="module-dark-table"
                                        pagination={false}
                                        scroll={{ x: true }}
                                        rowKey="key"
                                        dataSource={catalog.sample_rows.map((row, rowIndex) => ({ key: rowIndex, ...Object.fromEntries(row.map((cell, index) => [index, cell])) }))}
                                        columns={catalog.headers.map((header, index) => ({ title: header, dataIndex: `${index}`, key: index, ellipsis: true }))}
                                    />
                                    <Button icon={<SearchOutlined />} onClick={runPreview} loading={busy === "preview"} disabled={!online || mapping.name === null || mapping.name === undefined}>
                                        {t("admin_demo_requests.preview_button")}
                                    </Button>
                                    {preview && (
                                        <div className="space-y-3">
                                            <Alert
                                                type="info"
                                                showIcon
                                                message={t("admin_demo_requests.preview_summary", {
                                                    importable: preview.importable,
                                                    total: preview.total_rows,
                                                    categories: preview.categories.length,
                                                })}
                                                description={
                                                    <div className="flex flex-wrap gap-1 pt-1">
                                                        {preview.categories.map((category) => (
                                                            <Tag key={category}>{category}</Tag>
                                                        ))}
                                                    </div>
                                                }
                                            />
                                            <Table
                                                size="small"
                                                className="module-dark-table"
                                                pagination={false}
                                                scroll={{ x: true }}
                                                rowKey="row"
                                                dataSource={preview.sample}
                                                columns={[
                                                    { title: t("admin_demo_requests.field_name"), dataIndex: "name", key: "name", ellipsis: true },
                                                    { title: t("admin_demo_requests.field_code"), dataIndex: "code", key: "code" },
                                                    { title: t("admin_demo_requests.field_category"), dataIndex: "category", key: "category" },
                                                    { title: t("admin_demo_requests.field_price"), dataIndex: "price", key: "price", render: money },
                                                    { title: t("admin_demo_requests.field_cost"), dataIndex: "cost", key: "cost", render: money },
                                                    { title: t("admin_demo_requests.field_taxRate"), dataIndex: "taxRate", key: "taxRate", render: (v) => (v === null ? "—" : `${v}%`) },
                                                ]}
                                            />
                                            {[...preview.warnings, ...preview.errors].length > 0 && (
                                                <Alert
                                                    type="warning"
                                                    message={t("admin_demo_requests.preview_issues")}
                                                    description={
                                                        <ul className="list-disc space-y-1 pl-5">
                                                            {[...preview.errors, ...preview.warnings].map((issue, index) => (
                                                                <li key={index}>{issueText(issue)}</li>
                                                            ))}
                                                        </ul>
                                                    }
                                                />
                                            )}
                                        </div>
                                    )}
                                    <Alert type="info" message={t("admin_demo_requests.stock_note")} />
                                </>
                            )}
                        </div>
                    )}
                </Section>

                <Section title={t("admin_demo_requests.account_section")}>
                    {provisioned ? (
                        <div className="space-y-4">
                            <Alert
                                type="success"
                                showIcon
                                icon={<CheckCircleOutlined />}
                                message={t("admin_demo_requests.provisioned", {
                                    username: request.provisioned_username || "—",
                                    count: importSummary?.imported_products ?? 0,
                                })}
                                description={request.access_sent_at ? t("admin_demo_requests.access_sent", { date: new Date(request.access_sent_at).toLocaleString() }) : null}
                            />
                            <div className="flex flex-wrap gap-3">
                                <Popconfirm
                                    title={t("admin.impersonate_confirm_title")}
                                    description={t("admin.impersonate_confirm_content")}
                                    onConfirm={impersonate}
                                    okText={t("common.confirm")}
                                    cancelText={t("common.cancel")}
                                    disabled={!online}
                                >
                                    <Button icon={<LoginOutlined />} disabled={!online}>{t("admin_demo_requests.impersonate")}</Button>
                                </Popconfirm>
                                <Popconfirm
                                    title={request.access_sent_at ? t("admin_demo_requests.resend_access") : t("admin_demo_requests.send_access")}
                                    description={<div className="max-w-xs">{t("admin_demo_requests.send_access_confirm", { email: request.email })}</div>}
                                    onConfirm={runSendAccess}
                                    okText={t("common.confirm")}
                                    cancelText={t("common.cancel")}
                                    disabled={!online}
                                >
                                    <Button type="primary" icon={<MailOutlined />} loading={busy === "access"} disabled={!online}>
                                        {request.access_sent_at ? t("admin_demo_requests.resend_access") : t("admin_demo_requests.send_access")}
                                    </Button>
                                </Popconfirm>
                            </div>
                        </div>
                    ) : (
                        <Popconfirm
                            title={t("admin_demo_requests.provision_confirm_title", { company: request.company_name })}
                            description={<div className="max-w-xs">{t("admin_demo_requests.provision_confirm_body", { email: request.email })}</div>}
                            onConfirm={runProvision}
                            okText={t("common.confirm")}
                            cancelText={t("common.cancel")}
                            disabled={!online || (catalog && (mapping.name === null || mapping.name === undefined))}
                        >
                            <Button
                                type="primary"
                                icon={<RocketOutlined />}
                                loading={busy === "provision"}
                                disabled={!online || (catalog && (mapping.name === null || mapping.name === undefined))}
                            >
                                {catalog ? t("admin_demo_requests.provision_button") : t("admin_demo_requests.provision_button_no_catalog")}
                            </Button>
                        </Popconfirm>
                    )}
                </Section>
            </div>
        </Drawer>
    );
};

export default DemoRequestDrawer;
