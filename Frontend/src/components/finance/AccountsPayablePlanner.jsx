import { useEffect, useState } from "react";
import {
    Alert,
    Button,
    Card,
    Col,
    DatePicker,
    Empty,
    Modal,
    Row,
    Table,
    Tag,
} from "antd";
import {
    CalendarOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    ReloadOutlined,
    WalletOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { financeService } from "../../services/financeService";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";
import { financeErrorMessage } from "../../utils/financeError";
import PaymentDetailsTable from "./PaymentDetailsTable";
import PaymentCreditsPanel from "./PaymentCreditsPanel";

const STATUS_COLORS = {
    overdue: "error",
    due_soon: "warning",
    current: "success",
    unscheduled: "default",
};

// Rows other than purchases (loan installments, IVA/ICA por pagar - see
// Backend/services/accountsPayable.service.js#loadOtherObligations) share
// the same cash plan but are paid from their own Accounting tab.
const KIND_COLORS = { purchase: "default", loan_installment: "blue", vat: "purple", ica: "geekblue" };

const AccountsPayablePlanner = ({ canEdit }) => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { formatCurrency } = useCurrency();
    const [plan, setPlan] = useState({ summary: {}, documents: [] });
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(null);
    const [dueDate, setDueDate] = useState(null);
    const [saving, setSaving] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const response = await financeService.getAccountsPayablePlan();
            setPlan(response?.data || { summary: {}, documents: [] });
        } catch (error) {
            toast.error(
                financeErrorMessage(error, t, "finance.payables_load_failed")
            );
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openDueDate = (row) => {
        setEditing(row);
        setDueDate(row.due_date ? dayjs(row.due_date) : null);
    };
    const saveDueDate = async () => {
        setSaving(true);
        try {
            await financeService.updatePurchaseDueDate(
                editing.id,
                dueDate ? dueDate.endOf("day").toISOString() : null
            );
            toast.success(t("finance.payables_due_updated"));
            setEditing(null);
            await load();
        } catch (error) {
            toast.error(
                financeErrorMessage(error, t, "finance.payables_due_failed")
            );
        } finally {
            setSaving(false);
        }
    };

    const columns = [
        {
            title: t("finance.payables_priority"),
            dataIndex: "status",
            width: 130,
            render: (value) => (
                <Tag color={STATUS_COLORS[value]}>
                    {t(`finance.payables_status_${value}`)}
                </Tag>
            ),
        },
        {
            title: t("finance.payables_purchase"),
            dataIndex: "number",
            width: 150,
            render: (value, row) => (
                <div>
                    <strong>{value}</strong>
                    {row.kind && row.kind !== "purchase" && (
                        <Tag className="mt-1 block w-fit" color={KIND_COLORS[row.kind]}>
                            {t(`finance.payables_kind_${row.kind}`)}
                        </Tag>
                    )}
                </div>
            ),
        },
        {
            title: t("finance.payables_supplier"),
            dataIndex: ["supplier", "name"],
            ellipsis: true,
        },
        {
            title: t("finance.payables_due_date"),
            dataIndex: "due_date",
            width: 145,
            render: (value, row) => row.kind && row.kind !== "purchase" ? (
                <span className="text-sm">
                    {value ? dayjs(value).format("DD/MM/YYYY") : t("finance.payables_tax_due_unset")}
                </span>
            ) : (
                <Button
                    type="link"
                    disabled={!canEdit}
                    icon={<CalendarOutlined />}
                    onClick={() => openDueDate(row)}
                >
                    {value
                        ? dayjs(value).format("DD/MM/YYYY")
                        : t("finance.payables_set_due")}
                </Button>
            ),
        },
        {
            title: t("finance.aging_column"),
            dataIndex: "aging_bucket",
            width: 115,
            render: (value) => <Tag>{t(`finance.aging_${value}`)}</Tag>,
        },
        {
            title: t("finance.payables_pending"),
            dataIndex: "pending",
            width: 135,
            align: "right",
            render: (value) => <strong>{formatCurrency(value)}</strong>,
        },
        {
            title: t("finance.payables_suggested"),
            dataIndex: "suggested_payment",
            width: 145,
            align: "right",
            render: (value, row) => (
                <span
                    className={
                        row.coverage === "unfunded"
                            ? "text-[var(--ohnix-status-rose)]"
                            : "text-[var(--ohnix-accent)] font-semibold"
                    }
                >
                    {formatCurrency(value)}
                </span>
            ),
        },
        {
            title: t("finance.payables_coverage"),
            dataIndex: "coverage",
            width: 110,
            render: (value) => (
                <Tag
                    icon={
                        value === "full" ? (
                            <CheckCircleOutlined />
                        ) : (
                            <ClockCircleOutlined />
                        )
                    }
                    color={
                        value === "full"
                            ? "success"
                            : value === "partial"
                              ? "warning"
                              : "error"
                    }
                >
                    {t(`finance.payables_coverage_${value}`)}
                </Tag>
            ),
        },
        {
            title: "",
            key: "manage",
            width: 110,
            render: (_, row) => row.link ? (
                <Button size="small" onClick={() => navigate(row.link.path, { state: { tab: row.link.tab } })}>
                    {t("finance.payables_manage")}
                </Button>
            ) : null,
        },
    ];

    return (
        <>
            <Card
                className="module-shell border border-[var(--ohnix-line-4)]"
                title={
                    <span className="flex items-center gap-2">
                        <WalletOutlined className="text-[var(--ohnix-accent)]" />
                        {t("finance.payables_title")}
                    </span>
                }
                extra={
                    // Icon-only on phones: with the label, antd's card header
                    // squeezed the title down to "Planificado..." beside it.
                    <Button
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={load}
                        aria-label={t("finance.payables_refresh")}
                    >
                        <span className="hidden sm:inline">{t("finance.payables_refresh")}</span>
                    </Button>
                }
            >
                <div className="withholding-report-intro">
                    <div>
                        <span>{t("finance.payables_eyebrow")}</span>
                        <h3>{t("finance.payables_heading")}</h3>
                        <p>{t("finance.payables_desc")}</p>
                    </div>
                    <WalletOutlined />
                </div>
                <Alert
                    className="dark-alert dark-alert-teal mb-4"
                    type="info"
                    showIcon
                    message={t("finance.payables_explanation")}
                />
                <Row gutter={[12, 12]} className="mb-5">
                    {[
                        ["available_cash", "payables_available"],
                        ["total_pending", "payables_total"],
                        ["planned_payment", "payables_planned"],
                        ["funding_gap", "payables_gap"],
                    ].map(([key, label]) => (
                        <Col xs={12} lg={6} key={key}>
                            <div
                                className={`withholding-report-kpi ${key === "planned_payment" ? "withholding-report-kpi--net" : ""}`}
                            >
                                <span>{t(`finance.${label}`)}</span>
                                <strong>
                                    {formatCurrency(plan.summary?.[key] || 0)}
                                </strong>
                            </div>
                        </Col>
                    ))}
                </Row>
                <h4 className="text-sm font-semibold text-[var(--ohnix-text-primary)] mb-2">
                    {t("finance.aging_title")}
                </h4>
                <p className="text-xs text-[var(--ohnix-text-muted)] mb-3">
                    {t("finance.aging_help")}
                </p>
                <Row gutter={[8, 8]} className="mb-5">
                    {[
                        "not_due",
                        "days_1_30",
                        "days_31_60",
                        "days_61_90",
                        "over_90",
                        "unscheduled",
                    ].map((key) => (
                        <Col xs={12} md={8} xl={4} key={key}>
                            <div className="withholding-report-kpi">
                                <span>{t(`finance.aging_${key}`)}</span>
                                <strong>
                                    {formatCurrency(
                                        plan.summary?.aging?.[key] || 0
                                    )}
                                </strong>
                            </div>
                        </Col>
                    ))}
                </Row>
                <Table
                    expandable={{ rowExpandable: (row) => !row.kind || row.kind === "purchase", expandedRowRender: (row) => <PaymentDetailsTable payments={row.payment_details} documentId={row.id} payable pending={row.pending} canEdit={canEdit} onApplied={load} /> }}
                    className="module-dark-table"
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={plan.documents || []}
                    scroll={{ x: 1180 }}
                    pagination={{ pageSize: 8, hideOnSinglePage: true }}
                    locale={{
                        emptyText: (
                            <Empty
                                description={
                                    <div>
                                        <strong>
                                            {t("finance.payables_empty_title")}
                                        </strong>
                                        <p>
                                            {t("finance.payables_empty_desc")}
                                        </p>
                                        <Link to="/purchases">
                                            <Button type="primary">
                                                {t(
                                                    "finance.payables_go_purchases"
                                                )}
                                            </Button>
                                        </Link>
                                    </div>
                                }
                            />
                        ),
                    }}
                />
                {plan.documents?.length > 0 && (
                    <div className="flex justify-end mt-4">
                        <Link to="/purchases">
                            <Button type="primary">
                                {t("finance.payables_register_payments")}
                            </Button>
                        </Link>
                    </div>
                )}
            </Card>
            <PaymentCreditsPanel payable />
            <Modal
                open={Boolean(editing)}
                title={t("finance.payables_edit_due_title")}
                onCancel={() => setEditing(null)}
                onOk={saveDueDate}
                confirmLoading={saving}
                okText={t("common.save")}
            >
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">
                    {t("finance.payables_edit_due_help", {
                        number: editing?.number,
                        supplier: editing?.supplier?.name,
                    })}
                </p>
                <DatePicker
                    value={dueDate}
                    onChange={setDueDate}
                    className="w-full"
                    allowClear
                />
            </Modal>
        </>
    );
};

export default AccountsPayablePlanner;
