import React, { useEffect, useMemo } from "react";
import { Modal, Form, Select, DatePicker, Button, Checkbox } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Option } = Select;
const { RangePicker } = DatePicker;

// Drafts a new PayrollPeriod - the employee list is scoped to whichever
// periodicity is picked (Backend/services/payroll.service.js#
// createPayrollPeriod only pulls active employees matching it), so
// switching periodicity here re-filters the checkbox list live.
const CreatePayrollPeriodModal = ({ visible, employees, loading, onSubmit, onCancel }) => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const periodicity = Form.useWatch("periodicity", form) || "monthly";

    useEffect(() => {
        if (visible) {
            form.resetFields();
            form.setFieldsValue({ periodicity: "monthly" });
        }
    }, [visible, form]);

    const matchingEmployees = useMemo(
        () => (employees || []).filter((e) => e.status === "active" && e.pay_frequency === periodicity),
        [employees, periodicity]
    );

    const handleOk = async () => {
        const values = await form.validateFields();
        await onSubmit({
            periodicity: values.periodicity,
            startDate: values.range[0].startOf("day").toISOString(),
            endDate: values.range[1].endOf("day").toISOString(),
            paymentDate: values.payment_date ? values.payment_date.toISOString() : undefined,
            employeeIds: values.employee_ids?.length ? values.employee_ids : undefined,
        });
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <CalendarOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">{t("payroll.new_period")}</span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={560}
            centered
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    borderRadius: "20px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            <Form form={form} layout="vertical">
                <Form.Item name="periodicity" label={t("payroll.periodicity")} initialValue="monthly">
                    <Select size="large">
                        <Option value="monthly">{t("payroll.frequency_monthly")}</Option>
                        <Option value="biweekly">{t("payroll.frequency_biweekly")}</Option>
                        <Option value="weekly">{t("payroll.frequency_weekly")}</Option>
                    </Select>
                </Form.Item>

                <Form.Item name="range" label={t("payroll.period_range")} rules={[{ required: true, message: t("payroll.period_range_required") }]}>
                    <RangePicker size="large" className="w-full" format="YYYY-MM-DD" />
                </Form.Item>

                <Form.Item name="payment_date" label={t("payroll.payment_date_optional")}>
                    <DatePicker size="large" className="w-full" format="YYYY-MM-DD" />
                </Form.Item>

                <Form.Item name="employee_ids" label={t("payroll.included_employees")}>
                    {matchingEmployees.length === 0 ? (
                        <p className="text-xs text-[var(--ohnix-text-dim)]">{t("payroll.no_matching_employees_hint")}</p>
                    ) : (
                        <Checkbox.Group className="w-full">
                            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                {matchingEmployees.map((e) => (
                                    <div key={e._id} className="flex items-center">
                                        <Checkbox value={e._id}>
                                            {e.full_name} <span className="text-[var(--ohnix-text-dim)] text-xs">({e.document_number})</span>
                                        </Checkbox>
                                    </div>
                                ))}
                            </div>
                        </Checkbox.Group>
                    )}
                    <p className="text-xs text-[var(--ohnix-text-dim)] mt-2 mb-0">{t("payroll.included_employees_hint")}</p>
                </Form.Item>
            </Form>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 mt-2 border-t border-[var(--ohnix-line-4)]">
                <Button onClick={onCancel} disabled={loading} className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)]">
                    {t("common.cancel")}
                </Button>
                <Button
                    type="primary"
                    onClick={handleOk}
                    loading={loading}
                    disabled={matchingEmployees.length === 0}
                    className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                >
                    {t("payroll.create_period")}
                </Button>
            </div>
        </Modal>
    );
};

export default CreatePayrollPeriodModal;
