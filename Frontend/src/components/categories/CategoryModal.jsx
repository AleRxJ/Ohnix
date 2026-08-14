import React, { useContext, useEffect, useState } from "react";
import { Modal, Form, Input, Button, Space } from "antd";
import { TagsOutlined } from "@ant-design/icons";
import { FORM_RULES, MODAL_WIDTH } from "../../utils/category_units/constants";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";
import { useInventoryTour } from "../../context/InventoryTourContext";

const CategoryModal = ({
    visible,
    onClose,
    onSubmit,
    editingCategory,
    form,
    submitting,
}) => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { team } = useTeam();
    const { isOpen: isTutorialActive, effectiveSteps, stepIndex } = useInventoryTour();
    const [isTourCreateStep, setIsTourCreateStep] = useState(false);
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

    // Snapshotted only on the open transition, not re-derived reactively
    // while the modal stays open - notifyAction() can advance the tour to
    // the next step (this same create can satisfy it) while this modal is
    // still visible, a tick before its own onCancel/onSubmit handler closes
    // it. Re-deriving "is this the tour's create step" live would flip the
    // field from disabled+prefilled back to blank right before close,
    // which reads as the modal closing and reopening empty.
    useEffect(() => {
        if (!visible) return;
        const isTourCreateStepNow =
            isTutorialActive && effectiveSteps[stepIndex]?.id === "create-category";
        setIsTourCreateStep(isTourCreateStepNow);
        if (editingCategory) {
            form.setFieldsValue({
                category_name: editingCategory.category_name,
            });
        } else {
            form.resetFields();
            if (isTourCreateStepNow) {
                form.setFieldsValue({ category_name: t("inventory_tour.practice_category_name") });
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const handleSubmit = (values) => {
        onSubmit(values);
    };

    return (
        <Modal
            title={
                <div className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
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
                    border: "1px solid var(--ohnix-line-4)",
                    boxShadow: "0 24px 70px rgba(0,0,0,0.6)",
                    borderRadius: "24px",
                },
                header: {
                    background: "transparent",
                    borderBottom: "1px solid var(--ohnix-line-3)",
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
                        <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
                            {t("categories.category_name")}
                        </span>
                    }
                    rules={FORM_RULES.CATEGORY_NAME}
                    className="mb-6"
                    extra={isTourCreateStep ? t("inventory_tour.practice_locked_hint") : undefined}
                >
                    <Input
                        placeholder={t("categories.enter_category_name")}
                        className="h-11 rounded-md auth-ohnix-input"
                        prefix={
                            <TagsOutlined className="text-[var(--ohnix-text-dim)] text-sm" />
                        }
                        disabled={isTourCreateStep}
                    />
                </Form.Item>

                <Form.Item className="mb-0">
                    <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-[var(--ohnix-line-4)]">
                        <Button
                            onClick={onClose}
                            disabled={submitting}
                            className="h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200"
                        >
                            {t("common.cancel")}
                        </Button>
                        <Button
                            type="primary"
                            htmlType="submit"
                            loading={submitting}
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
