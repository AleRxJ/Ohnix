import React, { useCallback, useEffect, useState } from "react";
import { Table, Button, Modal, Form, InputNumber, Row, Col } from "antd";
import { PlusOutlined, SettingOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { payrollService } from "../../services/payrollService";
import EmptyState from "../common/EmptyState";

const DEFAULT_BRACKETS = [
    { minSmlmv: 4, rate: 1 },
    { minSmlmv: 16, rate: 1.2 },
    { minSmlmv: 17, rate: 1.4 },
    { minSmlmv: 18, rate: 1.6 },
    { minSmlmv: 19, rate: 1.8 },
    { minSmlmv: 20, rate: 2 },
];

// Admin-only: SMLMV/auxilio de transporte/UVT/monthly-work-hours divisor
// set by the government each year - see PayrollLegalParameter's schema
// comment for why this is platform-wide, not per-account. Every payroll
// calculation refuses to run for a year that has no row here.
const LegalParametersPanel = () => {
    const { t } = useI18n();
    const [params, setParams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [editing, setEditing] = useState(null);
    const [form] = Form.useForm();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await payrollService.listLegalParameters();
            setParams(res.data || []);
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    const openEditor = (row) => {
        setEditing(row || { year: new Date().getFullYear() + 1 });
        form.setFieldsValue(
            row
                ? {
                      year: row.year,
                      smlmv: row.smlmv,
                      transport_allowance: row.transport_allowance,
                      uvt: row.uvt,
                      monthly_work_hours: row.monthly_work_hours,
                  }
                : { year: new Date().getFullYear() + 1, monthly_work_hours: 240 }
        );
    };

    const handleSave = async () => {
        const values = await form.validateFields();
        try {
            await payrollService.saveLegalParameters({
                year: values.year,
                smlmv: values.smlmv,
                transportAllowance: values.transport_allowance,
                uvt: values.uvt,
                monthlyWorkHours: values.monthly_work_hours,
                pensionSolidarityBrackets: editing?.pension_solidarity_brackets || DEFAULT_BRACKETS,
            });
            toast.success(t("payroll.legal_parameters_saved"));
            setEditing(null);
            await load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    const columns = [
        { title: t("payroll.year"), dataIndex: "year", key: "year" },
        { title: t("payroll.smlmv"), dataIndex: "smlmv", key: "smlmv" },
        { title: t("payroll.transport_allowance"), dataIndex: "transport_allowance", key: "transport_allowance" },
        { title: t("payroll.uvt"), dataIndex: "uvt", key: "uvt" },
        { title: t("payroll.monthly_work_hours"), dataIndex: "monthly_work_hours", key: "monthly_work_hours" },
        {
            title: t("common.actions"),
            key: "actions",
            render: (_, row) => (
                <Button size="small" onClick={() => openEditor(row)}>
                    {t("common.edit")}
                </Button>
            ),
        },
    ];

    return (
        <div className="space-y-4">
            <div className="flex justify-end">
                <Button type="primary" icon={<PlusOutlined />} onClick={() => openEditor(null)}>
                    {t("payroll.add_year")}
                </Button>
            </div>
            <div className="module-shell rounded-3xl border border-[var(--ohnix-line-4)] overflow-hidden">
                <Table
                    rowKey="year"
                    columns={columns}
                    dataSource={params}
                    loading={loading}
                    pagination={false}
                    locale={{ emptyText: <EmptyState icon={<SettingOutlined />} title={t("payroll.no_legal_parameters")} /> }}
                />
            </div>

            <Modal title={t("payroll.legal_parameters_for_year")} open={Boolean(editing)} onCancel={() => setEditing(null)} onOk={handleSave} okText={t("common.save")} cancelText={t("common.cancel")}>
                <Form form={form} layout="vertical">
                    <Row gutter={12}>
                        <Col span={12}>
                            <Form.Item name="year" label={t("payroll.year")} rules={[{ required: true }]}>
                                <InputNumber className="w-full" min={2000} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="smlmv" label={t("payroll.smlmv")} rules={[{ required: true }]}>
                                <InputNumber className="w-full" min={1} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="transport_allowance" label={t("payroll.transport_allowance")} rules={[{ required: true }]}>
                                <InputNumber className="w-full" min={0} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="uvt" label={t("payroll.uvt")} rules={[{ required: true }]}>
                                <InputNumber className="w-full" min={1} />
                            </Form.Item>
                        </Col>
                        <Col span={12}>
                            <Form.Item name="monthly_work_hours" label={t("payroll.monthly_work_hours")} initialValue={240}>
                                <InputNumber className="w-full" min={1} />
                            </Form.Item>
                        </Col>
                    </Row>
                </Form>
            </Modal>
        </div>
    );
};

export default LegalParametersPanel;
