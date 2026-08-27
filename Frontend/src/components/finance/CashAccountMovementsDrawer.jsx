import { useState } from "react";
import { Drawer, Table, Tag, Divider, Form, DatePicker, Input, InputNumber, Button, Modal, Select, Spin } from "antd";
import { CloseOutlined, PlusOutlined, WalletOutlined } from "@ant-design/icons";
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

    const {
        movements,
        unmatchedMovements,
        unmatchedEntries,
        loading,
        submitting,
        addStatementEntry,
        matchEntry,
    } = useCashAccountMovements(account?._id);

    if (!account) return null;

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
                            notFoundContent={t("finance.no_unmatched_movements")}
                        >
                            {unmatchedMovements.map((m) => (
                                <Option key={m._id} value={m._id}>
                                    {dayjs(m.createdAt).format("DD/MM/YYYY")} · {m.delta >= 0 ? "+" : ""}
                                    {formatCurrency(m.delta)} · {m.reason || t(SOURCE_LABEL_KEYS[m.source_type] || m.source_type)}
                                </Option>
                            ))}
                        </Select>
                    </div>
                )}
            </Modal>
        </Drawer>
    );
};

export default CashAccountMovementsDrawer;
