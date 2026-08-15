import React, { useEffect, useState } from "react";
import { Card, Form, InputNumber, Button } from "antd";
import { PercentageOutlined } from "@ant-design/icons";
import { toast } from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { adminService } from "../../services/adminService";

// Colombia's general VAT rate (ET art. 468), the art. 437 par. 3 UVT
// threshold, and the UVT's own peso value all change by government decree/
// resolution - not by an Ohnix deploy - so they live as data (SystemSetting)
// instead of a hardcoded constant, and this is where an admin updates them
// when DIAN publishes new values (e.g. a new UVT every December).
const ColombiaTaxSettingsTab = () => {
    const { t } = useI18n();
    const [form] = Form.useForm();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const response = await adminService.getColombiaTaxSettings();
                if (!cancelled) {
                    form.setFieldsValue(response?.data || {});
                }
            } catch (error) {
                toast.error(error.response?.data?.message || t("common.error"));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSave = async (values) => {
        try {
            setSaving(true);
            await adminService.updateColombiaTaxSettings(values);
            toast.success(t("admin.colombia_tax_saved"));
        } catch (error) {
            toast.error(error.response?.data?.message || t("common.error"));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="module-shell border border-[var(--ohnix-line-4)] max-w-xl" loading={loading}>
            <div className="mb-1 flex items-center gap-2 text-sm font-bold text-[var(--ohnix-text-primary)]">
                <PercentageOutlined className="text-[#44F3F0]" />
                {t("admin.colombia_tax_title")}
            </div>
            <p className="mb-4 text-xs text-[var(--ohnix-text-dim)]">{t("admin.colombia_tax_hint")}</p>

            <Form form={form} layout="vertical" onFinish={handleSave}>
                <Form.Item
                    name="vatRate"
                    label={t("admin.colombia_tax_vat_rate")}
                    extra={<span className="text-[var(--ohnix-text-dim)]">{t("admin.colombia_tax_vat_rate_hint")}</span>}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <InputNumber min={0} max={100} precision={2} size="large" className="w-full auth-ohnix-input" addonAfter="%" />
                </Form.Item>

                <Form.Item
                    name="vatResponsibleThresholdUvt"
                    label={t("admin.colombia_tax_uvt_threshold")}
                    extra={<span className="text-[var(--ohnix-text-dim)]">{t("admin.colombia_tax_uvt_threshold_hint")}</span>}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                >
                    <InputNumber min={0} precision={0} size="large" className="w-full auth-ohnix-input" addonAfter="UVT" />
                </Form.Item>

                <Form.Item
                    name="uvtValue"
                    label={t("admin.colombia_tax_uvt_value")}
                    extra={<span className="text-[var(--ohnix-text-dim)]">{t("admin.colombia_tax_uvt_value_hint")}</span>}
                    rules={[{ required: true, message: t("validation.required_field") }]}
                    className="mb-0"
                >
                    <InputNumber min={0} precision={2} size="large" className="w-full auth-ohnix-input" addonBefore="$" />
                </Form.Item>

                <Button
                    type="primary"
                    htmlType="submit"
                    loading={saving}
                    className="mt-4 h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium"
                >
                    {t("common.save")}
                </Button>
            </Form>
        </Card>
    );
};

export default ColombiaTaxSettingsTab;
