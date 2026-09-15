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
    ReloadOutlined,
    RiseOutlined,
    TeamOutlined,
    WhatsAppOutlined,
} from "@ant-design/icons";
import { Link } from "react-router-dom";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import { financeService } from "../../services/financeService";
import { useCurrency } from "../../context/CurrencyContext";
import useI18n from "../../hooks/useI18n";
import { financeErrorMessage } from "../../utils/financeError";
import PaymentDetailsTable from "./PaymentDetailsTable";

const COLORS = {
    overdue: "error",
    due_soon: "warning",
    current: "success",
    unscheduled: "default",
};

const AccountsReceivablePlanner = ({ canEdit }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [plan, setPlan] = useState({ summary: {}, documents: [] });
    const [loading, setLoading] = useState(false);
    const [editing, setEditing] = useState(null);
    const [dueDate, setDueDate] = useState(null);
    const [saving, setSaving] = useState(false);
    const load = async () => {
        setLoading(true);
        try {
            const response = await financeService.getAccountsReceivablePlan();
            setPlan(response?.data || { summary: {}, documents: [] });
        } catch (error) {
            toast.error(
                financeErrorMessage(error, t, "finance.receivables_load_failed")
            );
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => {
        load();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const openDate = (row) => {
        setEditing(row);
        setDueDate(row.due_date ? dayjs(row.due_date) : null);
    };
    const saveDate = async () => {
        setSaving(true);
        try {
            await financeService.updateOrderDueDate(
                editing.id,
                dueDate ? dueDate.endOf("day").toISOString() : null
            );
            toast.success(t("finance.receivables_due_updated"));
            setEditing(null);
            await load();
        } catch (error) {
            toast.error(
                financeErrorMessage(error, t, "finance.receivables_due_failed")
            );
        } finally {
            setSaving(false);
        }
    };
    const remind = (row) => {
        if (!row.customer.phone)
            return toast.error(t("finance.receivables_phone_missing"));
        const phone = row.customer.phone.replace(/\D/g, "");
        const message = t("finance.receivables_message", {
            customer: row.customer.name,
            invoice: row.number,
            amount: formatCurrency(row.pending),
            date: row.due_date
                ? dayjs(row.due_date).format("DD/MM/YYYY")
                : t("finance.receivables_no_date"),
        });
        window.open(
            `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
            "_blank",
            "noopener,noreferrer"
        );
    };
    const columns = [
        {
            title: t("finance.payables_priority"),
            dataIndex: "status",
            width: 125,
            render: (value) => (
                <Tag color={COLORS[value]}>
                    {t(`finance.payables_status_${value}`)}
                </Tag>
            ),
        },
        {
            title: t("finance.receivables_invoice"),
            dataIndex: "number",
            width: 120,
            render: (value) => <strong>{value}</strong>,
        },
        {
            title: t("finance.receivables_customer"),
            dataIndex: ["customer", "name"],
            ellipsis: true,
        },
        {
            title: t("finance.payables_due_date"),
            dataIndex: "due_date",
            width: 145,
            render: (value, row) => (
                <Button
                    type="link"
                    disabled={!canEdit}
                    icon={<CalendarOutlined />}
                    onClick={() => openDate(row)}
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
            render: (value) => (
                <strong className="text-[var(--ohnix-status-rose)]">
                    {formatCurrency(value)}
                </strong>
            ),
        },
        {
            title: "",
            width: 125,
            fixed: "right",
            render: (_, row) => (
                <Button
                    size="small"
                    icon={<WhatsAppOutlined />}
                    onClick={() => remind(row)}
                >
                    {t("finance.receivables_remind")}
                </Button>
            ),
        },
    ];
    return (
        <>
            <Card
                className="module-shell border border-[var(--ohnix-line-4)]"
                title={
                    <span className="flex items-center gap-2">
                        <TeamOutlined className="text-[var(--ohnix-accent)]" />
                        {t("finance.receivables_title")}
                    </span>
                }
                extra={
                    <Button
                        icon={<ReloadOutlined />}
                        loading={loading}
                        onClick={load}
                    >
                        {t("finance.payables_refresh")}
                    </Button>
                }
            >
                <div className="withholding-report-intro">
                    <div>
                        <span>{t("finance.receivables_eyebrow")}</span>
                        <h3>{t("finance.receivables_heading")}</h3>
                        <p>{t("finance.receivables_desc")}</p>
                    </div>
                    <RiseOutlined />
                </div>
                <Alert
                    className="dark-alert dark-alert-teal mb-4"
                    type="info"
                    showIcon
                    message={t("finance.receivables_explanation")}
                />
                <Row gutter={[12, 12]} className="mb-5">
                    {[
                        ["total_pending", "receivables_total"],
                        ["overdue", "receivables_overdue"],
                        ["due_soon", "receivables_due_soon"],
                        ["unscheduled", "receivables_unscheduled"],
                    ].map(([key, label]) => (
                        <Col xs={12} lg={6} key={key}>
                            <div
                                className={`withholding-report-kpi ${key === "total_pending" ? "withholding-report-kpi--net" : ""}`}
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
                    expandable={{ expandedRowRender: (row) => <PaymentDetailsTable payments={row.payment_details} documentId={row.id} pending={row.pending} canEdit={canEdit} onApplied={load} /> }}
                    className="module-dark-table"
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={plan.documents || []}
                    scroll={{ x: 850 }}
                    pagination={{ pageSize: 8, hideOnSinglePage: true }}
                    locale={{
                        emptyText: (
                            <Empty
                                description={
                                    <div>
                                        <strong>
                                            {t(
                                                "finance.receivables_empty_title"
                                            )}
                                        </strong>
                                        <p>
                                            {t(
                                                "finance.receivables_empty_desc"
                                            )}
                                        </p>
                                    </div>
                                }
                            />
                        ),
                    }}
                />
                {plan.documents?.length > 0 && (
                    <div className="flex justify-end mt-4">
                        <Link to="/orders">
                            <Button type="primary">
                                {t("finance.receivables_register_payments")}
                            </Button>
                        </Link>
                    </div>
                )}
            </Card>
            <Modal
                open={Boolean(editing)}
                title={t("finance.receivables_edit_due_title")}
                onCancel={() => setEditing(null)}
                onOk={saveDate}
                confirmLoading={saving}
                okText={t("common.save")}
            >
                <p className="text-sm text-[var(--ohnix-text-muted)] mb-4">
                    {t("finance.receivables_edit_due_help", {
                        invoice: editing?.number,
                        customer: editing?.customer?.name,
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
export default AccountsReceivablePlanner;
