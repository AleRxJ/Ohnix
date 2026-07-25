import React, { useEffect } from "react";
import { Modal, Form, Input, Button, Space } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { FORM_RULES, MODAL_WIDTH } from "../../utils/category_units/constants";
import useI18n from "../../hooks/useI18n";

const UnitModal = ({ visible, onClose, onSubmit, editingUnit, form }) => {
    const { t } = useI18n();
    useEffect(() => {
        if (visible) {
            if (editingUnit) {
                form.setFieldsValue({
                    unit_name: editingUnit.unit_name,
                });
            } else {
                form.resetFields();
            }
        }
    }, [visible, editingUnit, form]);

    const handleSubmit = (values) => {
        onSubmit(values);
    };

    return (
        <Modal
            title={
                <div className="text-lg font-semibold text-white">
                    {editingUnit ? t("units.edit_unit") : t("units.add_new_unit")}
                </div>
            }
            open={visible}
            onCancel={onClose}
            footer={null}
            width={Math.min(480, window.innerWidth * 0.9)}
            centered
            className="unit-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background:
                        "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid rgba(255,255,255,0.08)",
                    padding: "20px 24px 16px",
                },
                body: { padding: "20px 24px 24px" },
            }}
        >
            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                className="space-y-6"
                size="large"
            >
                <Form.Item
                    name="unit_name"
                    label={
                        <span className="text-sm font-medium text-[#A9B3B8]">
                            {t("units.unit_name")}
                        </span>
                    }
                    rules={FORM_RULES.UNIT_NAME}
                    className="mb-6"
                >
                    <Input
                        placeholder={t("units.enter_unit_name")}
                        className="h-11 rounded-md auth-ohnix-input"
                        prefix={
                            <AppstoreOutlined className="text-[#8B98A0] text-sm" />
                        }
                    />
                </Form.Item>

                <Form.Item className="mb-0">
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-white/10">
                        <Button
                            onClick={onClose}
                            className="h-10 px-6 rounded-md bg-white/[0.04] border-white/10 text-white hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                        >
                            {t("common.cancel")}
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            className="h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200"
                        >
                            {editingUnit ? t("units.update_unit") : t("units.create_unit")}
                        </Button>
                    </div>
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default UnitModal;
