import { useMemo, useState } from "react";
import { Alert, Checkbox, Drawer, Table, Tag, Divider, Form, DatePicker, Input, InputNumber, Button, Modal, Select, Spin, Upload } from "antd";
import { BulbOutlined, CloseOutlined, PlusOutlined, ThunderboltOutlined, UploadOutlined, WalletOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";
import { useCashAccountMovements } from "../../hooks/finance/useCashAccounts";
import useIsMobile from "../../hooks/useIsMobile";

const { Option } = Select;

const SOURCE_LABEL_KEYS = {
    order_payment: "finance.source_order_payment",
    purchase_payment: "finance.source_purchase_payment",
    manual_deposit: "finance.source_manual_deposit",
    manual_withdrawal: "finance.source_manual_withdrawal",
    transfer_out: "finance.source_transfer_out",
    transfer_in: "finance.source_transfer_in",
    adjustment: "finance.source_adjustment",
};

const CashAccountMovementsDrawer = ({ visible, onClose, account }) => {
    const { t } = useI18n();
    const { formatCurrency, currency } = useCurrency();
    const isMobile = useIsMobile();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    const [entryForm] = Form.useForm();
    const [matchTarget, setMatchTarget] = useState(null); // the unmatched entry being reconciled
    const [matchMovementId, setMatchMovementId] = useState(null);
    const [importPreview, setImportPreview] = useState(null);
    const [importReading, setImportReading] = useState(false);
    const [suggestions, setSuggestions] = useState(null);
    const [selectedSuggestions, setSelectedSuggestions] = useState([]);

    const {
        movements,
        unmatchedMovements,
        unmatchedEntries,
        reconciliationSummary,
        loading,
        submitting,
        addStatementEntry,
        addStatementEntries,
        matchEntry,
        getSuggestions,
        matchEntries,
    } = useCashAccountMovements(account?._id);

    const normalizeHeader = (value) => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[\s_-]+/g, "");
    const pick = (row, names) => {
        const entries = Object.entries(row);
        const found = entries.find(([key]) => names.includes(normalizeHeader(key)));
        return found?.[1];
    };
    const parseNumber = (value) => {
        if (typeof value === "number") return value;
        const raw = String(value ?? "").trim().replace(/\s/g, "");
        if (!raw) return 0;
        const normalized = raw.includes(",") && raw.includes(".")
            ? (raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, ""))
            : raw.replace(",", ".");
        return Number(normalized.replace(/[^0-9.-]/g, ""));
    };
    const readStatementFile = async (file) => {
        setImportReading(true);
        try {
            const buffer = await file.arrayBuffer();
            const digest = await crypto.subtle.digest("SHA-256", buffer);
            const batchKey = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
            const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
            const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "", raw: true });
            if (!rows.length) throw new Error(t("finance.import_empty"));
            const parsed = rows.map((row, index) => {
                const rawDate = pick(row, ["fecha", "date", "fechamovimiento", "transactiondate"]);
                const excelDate = typeof rawDate === "number" ? XLSX.SSF.parse_date_code(rawDate) : null;
                const date = excelDate ? dayjs(new Date(excelDate.y, excelDate.m - 1, excelDate.d)) : dayjs(rawDate);
                const direct = pick(row, ["valor", "monto", "importe", "amount"]);
                const credit = parseNumber(pick(row, ["credito", "credit", "abono", "ingreso"]));
                const debit = parseNumber(pick(row, ["debito", "debit", "cargo", "salida"]));
                const amount = direct !== undefined ? parseNumber(direct) : credit - debit;
                if (!date.isValid() || !Number.isFinite(amount) || amount === 0) throw new Error(t("finance.import_row_invalid", { row: index + 2 }));
                return { entry_date: date.toISOString(), description: String(pick(row, ["descripcion", "description", "detalle", "concepto", "memo", "referencia"]) || "").trim() || null, amount, import_fingerprint: `${batchKey}:${index}` };
            });
            if (parsed.length > 1000) throw new Error(t("finance.import_too_many"));
            setImportPreview({ fileName: file.name, entries: parsed });
        } catch (error) {
            setImportPreview(null);
            Modal.error({ title: t("finance.import_failed"), content: error.message });
        } finally { setImportReading(false); }
        return false;
    };
    const confirmImport = async () => {
        const success = await addStatementEntries(importPreview.entries);
        if (success) setImportPreview(null);
    };
    const openSuggestions = async () => { const rows = await getSuggestions(); if (rows === null) return; setSuggestions(rows); setSelectedSuggestions(rows.filter((row) => !row.ambiguous).map((row) => row.entry._id)); };
    const confirmSuggestions = async () => { const chosen = suggestions.filter((row) => selectedSuggestions.includes(row.entry._id)); if (await matchEntries(chosen)) setSuggestions(null); };

    const handleAddEntry = async (values) => {
        const success = await addStatementEntry({
            entry_date: values.entry_date.toISOString(),
            description: values.description?.trim() || null,
            amount: values.amount,
        });
        if (success) entryForm.resetFields();
    };

    const openMatchModal = (entry) => {
        setMatchTarget(entry);
        setMatchMovementId(null);
    };

    const confirmMatch = async () => {
        if (!matchMovementId) return;
        const success = await matchEntry(matchTarget._id, matchMovementId);
        if (success) setMatchTarget(null);
    };

    const compatibleMovements = useMemo(() => {
        if (!matchTarget) return [];
        return unmatchedMovements
            .filter((movement) => Math.abs(Number(movement.delta) - Number(matchTarget.amount)) < 0.005)
            .sort((a, b) => Math.abs(dayjs(a.createdAt).diff(dayjs(matchTarget.entry_date), "minute")) - Math.abs(dayjs(b.createdAt).diff(dayjs(matchTarget.entry_date), "minute")));
    }, [matchTarget, unmatchedMovements]);

    if (!account) return null;

    const movementColumns = [
        {
            title: t("finance.col_date"),
            dataIndex: "createdAt",
            key: "createdAt",
            render: (v) => dayjs(v).format("DD/MM/YYYY HH:mm"),
            width: 140,
        },
        {
            title: t("finance.col_amount"),
            dataIndex: "delta",
            key: "delta",
            align: "right",
            render: (v) => (
                <span className={v >= 0 ? "text-green-500 font-medium" : "text-red-400 font-medium"}>
                    {v >= 0 ? "+" : ""}
                    {formatCurrency(v)}
                </span>
            ),
        },
        {
            title: t("finance.col_balance_after"),
            dataIndex: "balance_after",
            key: "balance_after",
            align: "right",
            render: (v) => formatCurrency(v),
        },
        {
            title: t("finance.col_source"),
            dataIndex: "source_type",
            key: "source_type",
            render: (v) => t(SOURCE_LABEL_KEYS[v] || v),
        },
        {
            title: t("finance.col_reason"),
            dataIndex: "reason",
            key: "reason",
            ellipsis: true,
            render: (v) => v || t("common.na"),
        },
        {
            title: t("finance.col_reconciled"),
            dataIndex: "reconciled_at",
            key: "reconciled_at",
            render: (v) =>
                v ? (
                    <Tag color="green">{t("finance.reconciled_yes")}</Tag>
                ) : (
                    <Tag color="default" className="!bg-[var(--ohnix-line-1)] !border-[var(--ohnix-line-4)] !text-[var(--ohnix-text-muted)]">
                        {t("finance.reconciled_no")}
                    </Tag>
                ),
        },
    ];

    const entryColumns = [
        {
            title: t("finance.col_date"),
            dataIndex: "entry_date",
            key: "entry_date",
            render: (v) => dayjs(v).format("DD/MM/YYYY"),
            width: 120,
        },
        {
            title: t("finance.entry_description_label"),
            dataIndex: "description",
            key: "description",
            ellipsis: true,
            render: (v) => v || t("common.na"),
        },
        {
            title: t("finance.col_amount"),
            dataIndex: "amount",
            key: "amount",
            align: "right",
            render: (v) => formatCurrency(v),
        },
        {
            title: "",
            key: "actions",
            width: 120,
            render: (_, record) => (
                <Button size="small" onClick={() => openMatchModal(record)}>
                    {t("finance.match_cta")}
                </Button>
            ),
        },
    ];

    return (
        <Drawer
            title={
                <div className="text-center w-full">
                    <span className="text-xl font-bold tracking-wide uppercase text-[var(--ohnix-text-primary)]">
                        {t("finance.movements_drawer_title", { name: account.name })}
                    </span>
                </div>
            }
            placement="right"
            onClose={onClose}
            open={visible}
            width={isMobile ? "100vw" : 640}
            closeIcon={<CloseOutlined className="text-[var(--ohnix-text-muted)]" />}
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.45)" },
                body: { padding: isMobile ? 16 : 24, background: "var(--ohnix-surface-card-soft)" },
                header: { borderBottom: "1px solid var(--ohnix-line-3)", padding: isMobile ? "16px" : "20px 24px", background: "var(--ohnix-surface-card-soft)" },
            }}
        >
            <div className="space-y-4 sm:space-y-6">
                <div className="rounded-2xl p-4 border border-[var(--ohnix-line-4)] flex items-center justify-between bg-[var(--ohnix-line-1)]">
                    <div className="flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[linear-gradient(135deg,rgba(41,216,213,0.18),rgba(68,243,240,0.06))]">
                            <WalletOutlined className="text-lg text-[#44F3F0]" />
                        </div>
                        <span className="font-semibold text-[var(--ohnix-text-primary)]">{account.name}</span>
                    </div>
                    <span className="text-xl font-bold text-[#44F3F0]">{formatCurrency(account.balance)}</span>
                </div>

                <div>
                    <h3 className="text-sm font-medium text-[var(--ohnix-text-muted)] mb-4 uppercase tracking-wide">
                        {t("finance.ledger_title")}
                    </h3>
                    {loading ? (
                        <div className="text-center py-12">
                            <Spin size="large" />
                        </div>
                    ) : movements.length > 0 ? (
                        <Table
                            className="module-dark-table"
                            dataSource={movements}
                            columns={movementColumns}
                            pagination={{ pageSize: 10 }}
                            rowKey="_id"
                            size="small"
                            scroll={{ x: 600 }}
                        />
                    ) : (
                        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                            <span className="text-sm text-[var(--ohnix-text-muted)]">{t("finance.no_movements")}</span>
                        </div>
                    )}
                </div>

                <Divider style={{ margin: "8px 0" }} />

                <div>
                    <h3 className="text-sm font-medium text-[var(--ohnix-text-muted)] mb-4 uppercase tracking-wide">
                        {t("finance.reconciliation_title")}
                    </h3>
                    <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon icon={<BulbOutlined />} message={t("finance.reconciliation_help_title")} description={t("finance.reconciliation_help_desc")} />
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mb-4">{[["coverage_percent", "reconciliation_coverage", (v) => `${v || 0}%`], ["matched_count", "reconciliation_matched", (v) => v || 0], ["unmatched_count", "reconciliation_pending", (v) => v || 0], ["unmatched_volume", "reconciliation_pending_value", (v) => formatCurrency(v || 0)]].map(([key, label, render]) => <div key={key} className="rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-3"><span className="block text-xs text-[var(--ohnix-text-muted)]">{t(`finance.${label}`)}</span><strong className="text-base text-[var(--ohnix-text-primary)]">{render(reconciliationSummary[key])}</strong></div>)}</div>

                    <div className="rounded-2xl border border-dashed border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-4 mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div><strong className="text-[var(--ohnix-text-primary)]">{t("finance.import_title")}</strong><p className="text-xs text-[var(--ohnix-text-muted)] mt-1 mb-0">{t("finance.import_help")}</p></div>
                        <Upload accept=".csv,.xlsx,.xls" showUploadList={false} beforeUpload={readStatementFile} disabled={submitting || importReading}>
                            <Button icon={<UploadOutlined />} loading={importReading}>{t("finance.import_cta")}</Button>
                        </Upload>
                    </div>

                    <Form form={entryForm} layout="vertical" onFinish={handleAddEntry} className="mb-6">
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <Form.Item name="entry_date" label={t("finance.entry_date_label")} rules={[{ required: true, message: t("validation.required_field") }]} className="mb-0">
                                <DatePicker className="w-full" format="DD/MM/YYYY" />
                            </Form.Item>
                            <Form.Item name="description" label={t("finance.entry_description_label")} className="mb-0">
                                <Input placeholder={t("finance.entry_description_placeholder")} maxLength={200} />
                            </Form.Item>
                            <Form.Item name="amount" label={t("finance.entry_amount_label")} rules={[{ required: true, message: t("validation.required_field") }]} className="mb-0">
                                <InputNumber
                                    className="w-full"
                                    prefix={currency.symbol}
                                    formatter={currencyInputProps.formatter}
                                    parser={currencyInputProps.parser}
                                />
                            </Form.Item>
                        </div>
                        <Button
                            type="primary"
                            htmlType="submit"
                            icon={<PlusOutlined />}
                            loading={submitting}
                            className="mt-3"
                        >
                            {t("finance.add_entry_cta")}
                        </Button>
                    </Form>

                    <h4 className="text-xs font-semibold text-[var(--ohnix-text-muted)] mb-3 uppercase tracking-wide">
                        {t("finance.unmatched_entries_title")}
                    </h4>
                    {unmatchedEntries.length > 0 && <Button className="mb-3" icon={<ThunderboltOutlined />} onClick={openSuggestions}>{t("finance.suggestions_cta")}</Button>}
                    {unmatchedEntries.length > 0 ? (
                        <Table
                            dataSource={unmatchedEntries}
                            columns={entryColumns}
                            pagination={false}
                            rowKey="_id"
                            size="small"
                            scroll={{ x: "max-content" }}
                        />
                    ) : (
                        <div className="text-sm text-[var(--ohnix-text-muted)] py-4">{t("finance.no_unmatched_entries")}</div>
                    )}
                </div>
            </div>

            <Modal
                title={t("finance.match_modal_title")}
                open={Boolean(matchTarget)}
                onCancel={() => setMatchTarget(null)}
                onOk={confirmMatch}
                confirmLoading={submitting}
                okButtonProps={{ disabled: !matchMovementId }}
                destroyOnClose
            >
                {matchTarget && (
                    <div className="space-y-3">
                        <div className="text-sm text-[var(--ohnix-text-muted)]">
                            {dayjs(matchTarget.entry_date).format("DD/MM/YYYY")} · {matchTarget.description || t("common.na")} ·{" "}
                            <span className="font-semibold text-[var(--ohnix-text-primary)]">{formatCurrency(matchTarget.amount)}</span>
                        </div>
                        <Select
                            className="w-full"
                            placeholder={t("finance.match_select_movement_placeholder")}
                            value={matchMovementId}
                            onChange={setMatchMovementId}
                            notFoundContent={t("finance.no_compatible_movements")}
                        >
                            {compatibleMovements.map((m) => (
                                <Option key={m._id} value={m._id}>
                                    {dayjs(m.createdAt).format("DD/MM/YYYY")} · {m.delta >= 0 ? "+" : ""}
                                    {formatCurrency(m.delta)} · {m.reason || t(SOURCE_LABEL_KEYS[m.source_type] || m.source_type)}
                                </Option>
                            ))}
                        </Select>
                        {compatibleMovements.length === 0 && <Alert type="warning" showIcon message={t("finance.reconciliation_no_match_help")} />}
                    </div>
                )}
            </Modal>
            <Modal title={t("finance.import_preview_title")} open={Boolean(importPreview)} onCancel={() => setImportPreview(null)} onOk={confirmImport} confirmLoading={submitting} okText={t("finance.import_confirm")} width={760}>
                {importPreview && <><Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.import_preview_summary", { file: importPreview.fileName, count: importPreview.entries.length })} description={t("finance.import_sign_help")} /><Table size="small" rowKey={(_, index) => index} pagination={{ pageSize: 8 }} dataSource={importPreview.entries} columns={[{ title: t("finance.col_date"), dataIndex: "entry_date", render: (v) => dayjs(v).format("DD/MM/YYYY") }, { title: t("finance.entry_description_label"), dataIndex: "description", ellipsis: true, render: (v) => v || t("common.na") }, { title: t("finance.col_amount"), dataIndex: "amount", align: "right", render: (v) => <span className={v > 0 ? "text-green-500" : "text-red-400"}>{v > 0 ? "+" : ""}{formatCurrency(v)}</span> }]} /></>}
            </Modal>
            <Modal title={t("finance.suggestions_title")} open={Array.isArray(suggestions)} onCancel={() => setSuggestions(null)} onOk={confirmSuggestions} confirmLoading={submitting} okButtonProps={{ disabled: selectedSuggestions.length === 0 }} okText={t("finance.suggestions_confirm")} width={820}>
                <Alert className="dark-alert dark-alert-teal mb-4" type="info" showIcon message={t("finance.suggestions_help_title")} description={t("finance.suggestions_help_desc")} />
                <Table className="module-dark-table" size="small" pagination={false} rowKey={(row) => row.entry._id} dataSource={suggestions || []} locale={{ emptyText: t("finance.suggestions_empty") }} columns={[{ title: "", width: 44, render: (_, row) => <Checkbox checked={selectedSuggestions.includes(row.entry._id)} onChange={(event) => setSelectedSuggestions((current) => event.target.checked ? [...current, row.entry._id] : current.filter((id) => id !== row.entry._id))} /> }, { title: t("finance.suggestions_statement"), render: (_, row) => <div><strong>{dayjs(row.entry.entry_date).format("DD/MM/YYYY")}</strong><small className="block text-[var(--ohnix-text-muted)]">{row.entry.description || t("common.na")}</small></div> }, { title: t("finance.suggestions_internal"), render: (_, row) => <div><strong>{dayjs(row.movement.createdAt).format("DD/MM/YYYY")}</strong><small className="block text-[var(--ohnix-text-muted)]">{row.movement.reason || t(SOURCE_LABEL_KEYS[row.movement.source_type] || row.movement.source_type)}</small></div> }, { title: t("finance.col_amount"), align: "right", render: (_, row) => formatCurrency(row.entry.amount) }, { title: t("finance.suggestions_confidence"), render: (_, row) => <Tag color={row.ambiguous ? "warning" : row.score >= 90 ? "success" : "processing"}>{row.ambiguous ? t("finance.suggestions_ambiguous") : `${row.score}%`}</Tag> }]} />
            </Modal>
        </Drawer>
    );
};

export default CashAccountMovementsDrawer;
