import React, { useEffect } from "react";
import { Modal, Form, Input, Select, InputNumber, Row, Col, Button, Switch, DatePicker } from "antd";
import { UserOutlined } from "@ant-design/icons";
import dayjs from "dayjs";
import useI18n from "../../hooks/useI18n";
import { useCurrency } from "../../context/CurrencyContext";
import { getCurrencyInputProps } from "../../utils/currency";
import PointOfSaleField from "../common/PointOfSaleField";

const { Option } = Select;

const fieldLabel = (text) => <span className="font-medium text-[var(--ohnix-text-muted)]">{text}</span>;

// Create/edit form for Employee - a payroll master-data record, distinct
// from User/TeamMember (see Backend Employee model's schema comment).
const EmployeeModal = ({ visible, editingEmployee, loading, onSave, onCancel }) => {
    const { t } = useI18n();
    const { currency } = useCurrency();
    const currencyInputProps = getCurrencyInputProps(currency.code);
    const [form] = Form.useForm();

    useEffect(() => {
        if (!visible) return;
        if (editingEmployee) {
            form.setFieldsValue({
                ...editingEmployee,
                hire_date: editingEmployee.hire_date ? dayjs(editingEmployee.hire_date) : null,
                point_of_sale_id: editingEmployee.point_of_sale_id?._id,
            });
        } else {
            form.resetFields();
            form.setFieldsValue({
                document_type: "CC",
                contract_type: "indefinido",
                worker_type: "normal",
                pay_frequency: "monthly",
                risk_level: "I",
                is_integral_salary: false,
            });
        }
    }, [visible, editingEmployee, form]);

    const handleOk = async () => {
        const values = await form.validateFields();
        await onSave({
            ...values,
            hire_date: values.hire_date ? values.hire_date.toISOString() : undefined,
        });
    };

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <UserOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-bold text-[var(--ohnix-text-primary)]">
                        {editingEmployee ? t("payroll.edit_employee") : t("payroll.new_employee")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onCancel}
            footer={null}
            width={720}
            centered
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
                    border: "1px solid var(--ohnix-line-4)",
                    borderRadius: "20px",
                },
                body: { padding: "20px 24px 24px", maxHeight: "75vh", overflowY: "auto" },
            }}
        >
            <Form form={form} layout="vertical">
                <Row gutter={12}>
                    <Col xs={24} sm={8}>
                        <Form.Item name="document_type" label={fieldLabel(t("payroll.document_type"))} initialValue="CC">
                            <Select size="large" options={["CC", "CE", "PA", "PEP"].map((v) => ({ value: v, label: v }))} />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={16}>
                        <Form.Item name="document_number" label={fieldLabel(t("payroll.document_number"))} rules={[{ required: true, message: t("payroll.document_number_required") }]}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="first_name" label={fieldLabel(t("payroll.first_name"))} rules={[{ required: true, message: t("payroll.first_name_required") }]}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="second_name" label={fieldLabel(t("payroll.second_name"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="last_name" label={fieldLabel(t("payroll.last_name"))} rules={[{ required: true, message: t("payroll.last_name_required") }]}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="second_last_name" label={fieldLabel(t("payroll.second_last_name"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="email" label={fieldLabel(t("payroll.email"))} rules={[{ type: "email", message: t("payroll.invalid_email") }]}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="phone" label={fieldLabel(t("payroll.phone"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="position" label={fieldLabel(t("payroll.position"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="hire_date" label={fieldLabel(t("payroll.hire_date"))} rules={[{ required: true, message: t("payroll.hire_date_required") }]}>
                            <DatePicker size="large" className="w-full auth-ohnix-input" format="YYYY-MM-DD" />
                        </Form.Item>
                    </Col>

                    <Col xs={24} sm={8}>
                        <Form.Item name="contract_type" label={fieldLabel(t("payroll.contract_type"))} initialValue="indefinido">
                            <Select size="large">
                                <Option value="indefinido">{t("payroll.contract_indefinido")}</Option>
                                <Option value="fijo">{t("payroll.contract_fijo")}</Option>
                                <Option value="obra_labor">{t("payroll.contract_obra_labor")}</Option>
                                <Option value="aprendizaje">{t("payroll.contract_aprendizaje")}</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Form.Item name="worker_type" label={fieldLabel(t("payroll.worker_type"))} initialValue="normal">
                            <Select size="large">
                                <Option value="normal">{t("payroll.worker_normal")}</Option>
                                <Option value="pensionado">{t("payroll.worker_pensionado")}</Option>
                                <Option value="aprendiz">{t("payroll.worker_aprendiz")}</Option>
                                <Option value="alto_riesgo">{t("payroll.worker_alto_riesgo")}</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={8}>
                        <Form.Item name="pay_frequency" label={fieldLabel(t("payroll.pay_frequency"))} initialValue="monthly">
                            <Select size="large">
                                <Option value="monthly">{t("payroll.frequency_monthly")}</Option>
                                <Option value="biweekly">{t("payroll.frequency_biweekly")}</Option>
                                <Option value="weekly">{t("payroll.frequency_weekly")}</Option>
                            </Select>
                        </Form.Item>
                    </Col>

                    <Col xs={24} sm={12}>
                        <Form.Item
                            name="base_salary"
                            label={fieldLabel(t("payroll.base_salary"))}
                            rules={[{ required: true, message: t("payroll.base_salary_required") }]}
                        >
                            <InputNumber
                                min={1}
                                precision={2}
                                prefix={currency.symbol}
                                formatter={currencyInputProps.formatter}
                                parser={currencyInputProps.parser}
                                className="w-full auth-ohnix-input"
                                size="large"
                            />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="risk_level" label={fieldLabel(t("payroll.risk_level"))} initialValue="I">
                            <Select size="large" options={["I", "II", "III", "IV", "V"].map((v) => ({ value: v, label: `${t("payroll.risk_level")} ${v}` }))} />
                        </Form.Item>
                    </Col>
                    <Col xs={24}>
                        <Form.Item name="is_integral_salary" valuePropName="checked" initialValue={false}>
                            <div className="flex items-center gap-2">
                                <Switch />
                                <span className="text-sm text-[var(--ohnix-text-muted)]">{t("payroll.is_integral_salary")}</span>
                            </div>
                        </Form.Item>
                    </Col>

                    <Col xs={24} sm={12}>
                        <Form.Item name="eps" label={fieldLabel(t("payroll.eps"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="pension_fund" label={fieldLabel(t("payroll.pension_fund"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="severance_fund" label={fieldLabel(t("payroll.severance_fund"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="compensation_fund" label={fieldLabel(t("payroll.compensation_fund"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>

                    <Col xs={24} sm={12}>
                        <Form.Item name="bank_name" label={fieldLabel(t("payroll.bank_name"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>
                    <Col xs={24} sm={12}>
                        <Form.Item name="bank_account_number" label={fieldLabel(t("payroll.bank_account_number"))}>
                            <Input size="large" className="auth-ohnix-input" />
                        </Form.Item>
                    </Col>

                    <Col xs={24}>
                        <PointOfSaleField name="point_of_sale_id" />
                    </Col>
                </Row>
            </Form>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-5 mt-2 border-t border-[var(--ohnix-line-4)]">
                <Button
                    onClick={onCancel}
                    disabled={loading}
                    className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)]"
                >
                    {t("common.cancel")}
                </Button>
                <Button
                    type="primary"
                    onClick={handleOk}
                    loading={loading}
                    className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                >
                    {t("payroll.save_employee")}
                </Button>
            </div>
        </Modal>
    );
};

export default EmployeeModal;
