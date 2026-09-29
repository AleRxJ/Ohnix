import { useCallback, useEffect, useMemo, useState } from "react";
import PropTypes from "prop-types";
import { Alert, Badge, Button, Modal, Select, Table, Tag, Tooltip } from "antd";
import { ClockCircleOutlined, SendOutlined, UserSwitchOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { api } from "../../api/api";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { electronicInvoiceService } from "../../services/electronicInvoiceService";
import { formatCurrency } from "../../utils/currency";
import { useDataInvalidation } from "../../hooks/useDataInvalidation";

// Age thresholds for the "Ventas sin documento" alert colors. Deliberately
// just visual nudges - the legal deadline is the company's (and its
// accountant's) call, not something Ohnix enforces.
const WARN_HOURS = 24;
const LATE_HOURS = 72;

const FIELD_LABEL_KEYS = {
    identificationDocumentCode: "pending_einvoices.field_doc_type",
    identification: "pending_einvoices.field_identification",
    legalOrganizationCode: "pending_einvoices.field_org",
    tributeCode: "pending_einvoices.field_tribute",
    municipalityCode: "pending_einvoices.field_municipality",
};

// Sales left with "Emitir después" - listed until someone sends them to DIAN.
// Sending reuses the normal issue endpoint (same numbering/claim guarantees).
export default function PendingEinvoicesPanel({ onIssued }) {
    const { t } = useI18n();
    const { hasPermission } = useTeam();
    const canIssue = hasPermission("einvoicing", "edit");
    const canChangeCustomer = canIssue && hasPermission("orders", "edit");
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [selected, setSelected] = useState([]);
    const [sendingIds, setSendingIds] = useState([]);
    const [customerModal, setCustomerModal] = useState(null);
    const [customers, setCustomers] = useState([]);
    const [customerId, setCustomerId] = useState(null);
    const [savingCustomer, setSavingCustomer] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const response = await api.get("/electronic-invoices/pending");
            setRows(response.data?.data?.orders || []);
        } catch {
            // Offline or no permission - the panel simply stays as it was.
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);
    useDataInvalidation(["order"], load);

    const issue = async (ids) => {
        setSendingIds(ids);
        let ok = 0;
        const failures = [];
        // One at a time on purpose: each takes a DIAN consecutive number, and
        // a failure on one sale must not stop or reorder the rest.
        for (const id of ids) {
            try {
                await electronicInvoiceService.issue(id);
                ok += 1;
            } catch (error) {
                const row = rows.find((r) => r._id === id);
                failures.push(`${row?.invoice_no || id}: ${error.response?.data?.message || t("pending_einvoices.send_failed")}`);
            }
        }
        setSendingIds([]);
        setSelected([]);
        if (ok) toast.success(t("pending_einvoices.sent_count", { count: ok }));
        if (failures.length) toast.error(failures.join("\n"), { duration: 8000 });
        await load();
        onIssued?.();
    };

    const openCustomerModal = async (row) => {
        setCustomerModal(row);
        setCustomerId(null);
        try {
            const response = await api.get("/customers");
            setCustomers(response.data?.data || []);
        } catch {
            setCustomers([]);
        }
    };

    const saveCustomer = async () => {
        setSavingCustomer(true);
        try {
            const response = await api.patch(`/orders/${customerModal._id}/einvoice-customer`, { customer_id: customerId });
            const missing = response.data?.data?.missing_fiscal_fields || [];
            toast.success(t("pending_einvoices.customer_changed"));
            if (missing.length) toast(t("pending_einvoices.customer_missing_data"), { icon: "⚠️" });
            setCustomerModal(null);
            await load();
        } catch (error) {
            toast.error(error.response?.data?.message || t("pending_einvoices.customer_change_failed"));
        } finally {
            setSavingCustomer(false);
        }
    };

    const issuable = useMemo(() => rows.filter((r) => r.can_issue_now && r.missing_fiscal_fields.length === 0), [rows]);

    const columns = [
        {
            title: t("pending_einvoices.col_waiting"),
            dataIndex: "deferred_at",
            width: 150,
            render: (value) => {
                const hours = dayjs().diff(dayjs(value), "hour");
                const color = hours >= LATE_HOURS ? "error" : hours >= WARN_HOURS ? "warning" : "default";
                return (
                    <Tooltip title={dayjs(value).format("DD/MM/YYYY HH:mm")}>
                        <Tag color={color} icon={<ClockCircleOutlined />}>
                            {hours < 1 ? t("pending_einvoices.less_than_hour") : hours < 48 ? t("pending_einvoices.hours", { count: hours }) : t("pending_einvoices.days", { count: Math.floor(hours / 24) })}
                        </Tag>
                    </Tooltip>
                );
            },
        },
        {
            title: t("pending_einvoices.col_sale"),
            dataIndex: "invoice_no",
            render: (value, row) => (
                <div>
                    <div className="font-medium">{value}</div>
                    {row.defer_reason && <div className="text-xs text-[var(--ohnix-text-dim)]">{row.defer_reason}</div>}
                </div>
            ),
        },
        {
            title: t("pending_einvoices.col_customer"),
            dataIndex: "customer",
            render: (customer, row) => (
                <div>
                    <div>{customer?.is_final_consumer ? t("pos.final_consumer") : customer?.name}</div>
                    {row.missing_fiscal_fields.length > 0 && (
                        <div className="text-xs text-[var(--ohnix-status-danger)]">
                            {t("pending_einvoices.missing")}: {row.missing_fiscal_fields.map((f) => t(FIELD_LABEL_KEYS[f])).join(", ")}
                        </div>
                    )}
                </div>
            ),
        },
        { title: t("pending_einvoices.col_total"), dataIndex: "total", align: "right", render: (v) => <span className="font-semibold tabular-nums">{formatCurrency(v, "COP")}</span> },
        {
            title: "",
            key: "actions",
            align: "right",
            render: (_, row) => (
                <div className="flex justify-end gap-2">
                    {canChangeCustomer && (
                        <Button size="small" icon={<UserSwitchOutlined />} onClick={() => openCustomerModal(row)}>
                            {t("pending_einvoices.change_customer")}
                        </Button>
                    )}
                    {canIssue && (
                        <Tooltip title={!row.can_issue_now ? t("pending_einvoices.not_completed") : row.missing_fiscal_fields.length ? t("pending_einvoices.fix_customer_first") : ""}>
                            <Button
                                size="small"
                                type="primary"
                                icon={<SendOutlined />}
                                loading={sendingIds.includes(row._id)}
                                disabled={!row.can_issue_now || row.missing_fiscal_fields.length > 0 || (sendingIds.length > 0 && !sendingIds.includes(row._id))}
                                onClick={() => issue([row._id])}
                            >
                                {t("pending_einvoices.send")}
                            </Button>
                        </Tooltip>
                    )}
                </div>
            ),
        },
    ];

    if (!loading && rows.length === 0) return null;

    const lateCount = rows.filter((r) => dayjs().diff(dayjs(r.deferred_at), "hour") >= LATE_HOURS).length;

    return (
        <section className="module-shell mb-6 rounded-3xl p-4 sm:p-5">
            <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div>
                    <h2 className="m-0 flex items-center gap-2 text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {t("pending_einvoices.title")} <Badge count={rows.length} />
                    </h2>
                    <p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("pending_einvoices.subtitle")}</p>
                </div>
                {canIssue && (
                    <Button
                        type="primary"
                        icon={<SendOutlined />}
                        disabled={selected.length === 0 || sendingIds.length > 0}
                        loading={sendingIds.length > 1}
                        onClick={() => issue(selected)}
                    >
                        {t("pending_einvoices.send_selected", { count: selected.length })}
                    </Button>
                )}
            </div>
            {lateCount > 0 && <Alert className="mb-4" type="error" showIcon message={t("pending_einvoices.late_alert", { count: lateCount })} />}
            <Table
                className="module-dark-table"
                size="small"
                rowKey="_id"
                loading={loading}
                dataSource={rows}
                columns={columns}
                scroll={{ x: 760 }}
                pagination={{ pageSize: 10, hideOnSinglePage: true }}
                rowSelection={
                    canIssue
                        ? {
                              selectedRowKeys: selected,
                              onChange: setSelected,
                              getCheckboxProps: (row) => ({ disabled: !issuable.includes(row) }),
                          }
                        : undefined
                }
            />

            <Modal
                open={Boolean(customerModal)}
                title={t("pending_einvoices.change_customer_title", { number: customerModal?.invoice_no || "" })}
                onCancel={() => setCustomerModal(null)}
                onOk={saveCustomer}
                okButtonProps={{ disabled: !customerId, loading: savingCustomer }}
                okText={t("common.save")}
            >
                <p className="text-sm text-[var(--ohnix-text-muted)]">{t("pending_einvoices.change_customer_help")}</p>
                <Select
                    showSearch
                    className="w-full"
                    size="large"
                    value={customerId}
                    onChange={setCustomerId}
                    optionFilterProp="label"
                    placeholder={t("orders.select_customer")}
                    options={customers
                        .filter((c) => c._id !== customerModal?.customer?._id)
                        .map((c) => ({ value: c._id, label: [c.name, c.identification].filter(Boolean).join(" · ") }))}
                />
            </Modal>
        </section>
    );
}

PendingEinvoicesPanel.propTypes = {
    onIssued: PropTypes.func,
};
