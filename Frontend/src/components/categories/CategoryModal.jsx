import React, { useContext, useEffect } from "react";
import { Modal, Form, Input, Button, Space } from "antd";
import { TagsOutlined } from "@ant-design/icons";
import { FORM_RULES, MODAL_WIDTH } from "../../utils/category_units/constants";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";

const CategoryModal = ({
    visible,
    onClose,
    onSubmit,
    editingCategory,
    form,
}) => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { team } = useTeam();
    const { viewers, lock, acquireLock, releaseLock } = useResourcePresence({
        resourceType: "category",
        resourceId: editingCategory?._id,
        active: visible && Boolean(team) && Boolean(editingCategory?._id),
    });

    useEffect(() => {
        if (visible && editingCategory?._id && team) acquireLock();
        if (!visible) releaseLock();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, editingCategory?._id]);

    useEffect(() => {
        if (visible) {
            if (editingCategory) {
                form.setFieldsValue({
                    category_name: editingCategory.category_name,
                });
            } else {
                form.resetFields();
            }
        }
    }, [visible, editingCategory, form]);

    const handleSubmit = (values) => {
        onSubmit(values);
    };

    return (
        <Modal
            title={
                <div className="text-lg font-semibold text-white">
                    {editingCategory ? t("categories.edit_category") : t("categories.add_new_category")}
                </div>
            }
            open={visible}
            onCancel={onClose}
            footer={null}
            width={Math.min(480, window.innerWidth * 0.9)}
            centered
            className="category-modal"
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
            {team && editingCategory?._id && (
                <PresenceLockBar viewers={viewers} lock={lock} currentUserId={user?.id} />
            )}
            <Form
                form={form}
                layout="vertical"
                onFinish={handleSubmit}
                className="space-y-6"
                size="large"
            >
                <Form.Item
                    name="category_name"
                    label={
                        <span className="text-sm font-medium text-[#A9B3B8]">
                            {t("categories.category_name")}
                        </span>
                    }
                    rules={FORM_RULES.CATEGORY_NAME}
                    className="mb-6"
                >
                    <Input
                        placeholder={t("categories.enter_category_name")}
                        className="h-11 rounded-md auth-ohnix-input"
                        prefix={
                            <TagsOutlined className="text-[#8B98A0] text-sm" />
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
                            {editingCategory
                                ? t("categories.update_category")
                                : t("categories.create_category")}
                        </Button>
                    </div>
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default CategoryModal;
