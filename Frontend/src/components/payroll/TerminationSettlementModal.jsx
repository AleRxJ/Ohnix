import React, { useEffect, useState } from "react";
import { Modal, Form, Select, DatePicker, InputNumber, Button, Alert, Descriptions } from "antd";
import { FileDoneOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { payrollService } from "../../services/payrollService";

const TERMINATION_REASONS = ["resignation", "just_cause", "without_just_cause", "contract_expiration", "mutual_agreement"];

const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
};

// "Liquidar contrato" - a two-step flow (calculate, then confirm) on top of
// payrollTermination.service.js: cesantías/intereses/prima/vacaciones
// pendientes (ALL accumulated buckets, not one at a time like
// BenefitAccrualsPanel) + indemnización when applicable, in one acta. See
// that service's own comment on what this deliberately does NOT model
// (fuero, preaviso).
const TerminationSettlementModal = ({ visible, employee, cashAccounts, onUpdateContractEndDate, onClose, onSettled }) => {
    const { t } = useI18n();
    const { formatCurrency } = useCurrency();
    const [form] = Form.useForm();
    const [reason, setReason] = useState();
    const [calculating, setCalculating] = useState(false);
    const [settling, setSettling] = useState(false);
    const [preview, setPreview] = useState(null);

    useEffect(() => {
        if (!visible) return;
        form.resetFields();
        setReason(undefined);
        setPreview(null);
    }, [visible, employee, form]);

    if (!employee) return null;

    const needsContractEndDate = employee.contract_type === "fijo" && !employee.contract_end_date;
    const needsRemainingWorkDays = employee.contract_type === "obra_labor" && reason === "without_just_cause";

    const handleCalculate = async () => {
        const values = await form.validateFields();
        setCalculating(true);
        try {
            if (needsContractEndDate && values.contract_end_date) {
                await onUpdateContractEndDate(employee._id, values.contract_end_date.toISOString());
            }
            const response = await payrollService.previewTermination({
                employeeId: employee._id,
                terminationDate: values.termination_date.toISOString(),
                terminationReason: values.termination_reason,
                remainingWorkDays: values.remaining_work_days,
                manualIndemnityOverride: values.manual_indemnity_override,
            });
            const data = response?.data;
            if (data?.already_settled) {
                toast.error(t("payroll.termination_already_settled"));
                return;
            }
            setPreview(data);
        } catch (err) {
            toast.error(err?.response?.data?.message || t("payroll.failed_preview_termination"));
        } finally {
            setCalculating(false);
        }
    };

    const handleConfirm = async () => {
        const values = form.getFieldsValue();
        setSettling(true);
        try {
            const response = await payrollService.settleTermination({
                employeeId: employee._id,
                terminationDate: values.termination_date.toISOString(),
                terminationReason: values.termination_reason,
                remainingWorkDays: values.remaining_work_days,
                manualIndemnityOverride: values.manual_indemnity_override,
                cashAccountId: values.cash_account_id,
            });
            toast.success(t("payroll.termination_settled"));
            onSettled?.(response?.data);
            handleDownloadPdf();
            onClose();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("payroll.failed_settle_termination"));
        } finally {
            setSettling(false);
        }
    };

    const handleDownloadPdf = async () => {
        try {
            const blob = await payrollService.downloadTerminationPdf(employee._id);
            downloadBlob(new Blob([blob], { type: "application/pdf" }), `liquidacion-${employee.full_name}.pdf`);
        } catch {
            toast.error(t("payroll.failed_download_settlement_pdf"));
        }
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <FileDoneOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">{t("payroll.terminate_employee_title", { name: employee.full_name })}</span>
                </div>
            }
            open={visible}
            onCancel={onClose}
            width={640}
            centered
            footer={
                preview
                    ? [
                          <Button key="back" onClick={() => setPreview(null)}>{t("common.back")}</Button>,
                          <Button key="confirm" type="primary" danger loading={settling} onClick={handleConfirm}>
                              {t("payroll.confirm_termination")}
                          </Button>,
                      ]
                    : [
                          <Button key="cancel" onClick={onClose}>{t("common.cancel")}</Button>,
                          <Button key="calculate" type="primary" loading={calculating} onClick={handleCalculate}>
                              {t("payroll.calculate_settlement")}
                          </Button>,
                      ]
            }
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    borderRadius: "20px",
                },
                body: { padding: "20px 24px 24px", maxHeight: "70vh", overflowY: "auto" },
            }}
        >
            {!preview ? (
                <Form form={form} layout="vertical">
                    <Alert className="dark-alert dark-alert-amber mb-4" type="warning" showIcon message={t("payroll.termination_legal_notice")} />
                    <Form.Item name="termination_date" label={t("payroll.termination_date")} rules={[{ required: true, message: t("validation.required_field") }]} initialValue={dayjs()}>
                        <DatePicker className="w-full" format="DD/MM/YYYY" />
                    </Form.Item>
                    <Form.Item name="termination_reason" label={t("payroll.termination_reason")} rules={[{ required: true, message: t("validation.required_field") }]}>
                        <Select onChange={setReason} options={TERMINATION_REASONS.map((value) => ({ value, label: t(`payroll.termination_reason_${value}`) }))} />
                    </Form.Item>
                    {needsContractEndDate && (
                        <Form.Item name="contract_end_date" label={t("payroll.contract_end_date")} extra={t("payroll.contract_end_date_hint")} rules={[{ required: true, message: t("validation.required_field") }]}>
                            <DatePicker className="w-full" format="DD/MM/YYYY" />
                        </Form.Item>
                    )}
                    {needsRemainingWorkDays && (
                        <Form.Item name="remaining_work_days" label={t("payroll.remaining_work_days")} extra={t("payroll.remaining_work_days_hint")} rules={[{ required: true, message: t("validation.required_field") }]}>
                            <InputNumber className="w-full" min={0} />
                        </Form.Item>
                    )}
                    <Form.Item name="manual_indemnity_override" label={t("payroll.manual_indemnity_override")} extra={t("payroll.manual_indemnity_override_hint")}>
                        <InputNumber className="w-full" min={0} />
                    </Form.Item>
                    <Form.Item name="cash_account_id" label={t("payroll.cash_account")} rules={[{ required: true, message: t("payroll.cash_account_required") }]}>
                        <Select options={(cashAccounts || []).map((a) => ({ value: a._id, label: a.name }))} />
                    </Form.Item>
                </Form>
            ) : (
                <div className="space-y-4">
                    <Alert className="dark-alert dark-alert-teal" type="info" showIcon message={t("payroll.settlement_salary_notice")} />
                    <Descriptions column={1} bordered size="small">
                        <Descriptions.Item label={t("payroll.benefit_type_severance")}>{formatCurrency(preview.severance_amount)}</Descriptions.Item>
                        <Descriptions.Item label={t("payroll.benefit_type_severance_interest")}>{formatCurrency(preview.severance_interest_amount)}</Descriptions.Item>
                        <Descriptions.Item label={t("payroll.benefit_type_service_bonus")}>{formatCurrency(preview.service_bonus_amount)}</Descriptions.Item>
                        <Descriptions.Item label={t("payroll.benefit_type_vacation")}>{formatCurrency(preview.vacation_amount)}</Descriptions.Item>
                        <Descriptions.Item label={preview.indemnity_days ? t("payroll.indemnity_with_days", { days: preview.indemnity_days }) : t("payroll.indemnity")}>
                            {formatCurrency(preview.indemnity_amount)}
                        </Descriptions.Item>
                        <Descriptions.Item label={<strong>{t("payroll.settlement_total")}</strong>}>
                            <strong className="text-[#44F3F0]">{formatCurrency(preview.total_amount)}</strong>
                        </Descriptions.Item>
                    </Descriptions>
                </div>
            )}
        </Modal>
    );
};

export default TerminationSettlementModal;
