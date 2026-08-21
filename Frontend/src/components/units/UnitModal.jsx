import React, { useContext, useEffect, useState } from "react";
import { Modal, Form, Input, Button, Space, Select, Tabs, Divider } from "antd";
import { AppstoreOutlined } from "@ant-design/icons";
import { getFormRules, MODAL_WIDTH } from "../../utils/category_units/constants";
import { COMMON_UNITS, UNIT_CATEGORIES, getUnitsByCategory } from "../../utils/commonUnits";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { useResourcePresence } from "../../hooks/useResourcePresence";
import PresenceLockBar from "../team/PresenceLockBar";
import FieldPresenceHighlighter from "../team/FieldPresenceHighlighter";
import { useInventoryTour } from "../../context/InventoryTourContext";

const UnitModal = ({ visible, onClose, onSubmit, editingUnit, form, submitting }) => {
    const { t } = useI18n();
    const [mode, setMode] = useState("common"); // "common" or "custom"
    const [selectedCategory, setSelectedCategory] = useState("Weight");
    const [selectedUnit, setSelectedUnit] = useState(null);
    const { user } = useContext(AuthContext);
    const { team } = useTeam();
    const { isOpen: isTutorialActive, effectiveSteps, stepIndex } = useInventoryTour();
    const [isTourCreateStep, setIsTourCreateStep] = useState(false);
    const { viewers, lock, acquireLock, releaseLock, fieldPresenceHandlers } = useResourcePresence({
        resourceType: "unit",
        resourceId: editingUnit?._id,
        active: visible && Boolean(team) && Boolean(editingUnit?._id),
    });

    useEffect(() => {
        if (visible && editingUnit?._id && team) acquireLock();
        if (!visible) releaseLock();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, editingUnit?._id]);

    // Snapshotted only on the open transition - see the matching comment in
    // CategoryModal.jsx. Re-deriving isTourCreateStep live while this modal
    // stays open would let the tour's own advance (triggered by this same
    // create, a tick before our onCancel/onSubmit handler closes us) wipe
    // the field back to blank right before close.
    useEffect(() => {
        if (!visible) return;
        const isTourCreateStepNow =
            isTutorialActive && effectiveSteps[stepIndex]?.id === "create-unit";
        setIsTourCreateStep(isTourCreateStepNow);
        if (editingUnit) {
            form.setFieldsValue({
                unit_name: editingUnit.unit_name,
            });
            setMode("custom");
        } else {
            form.resetFields();
            setSelectedCategory("Weight");
            setSelectedUnit(null);
            if (isTourCreateStepNow) {
                setMode("custom");
                form.setFieldsValue({ unit_name: t("inventory_tour.practice_unit_name") });
            } else {
                setMode("common");
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible]);

    const handleSelectCommonUnit = (unit) => {
        setSelectedUnit(unit);
        const unitNameTranslated = t(unit.translationKey || unit.name);
        form.setFieldsValue({
            unit_name: `${unitNameTranslated} (${unit.symbol})`,
        });
    };

    const handleSubmit = (values) => {
        onSubmit(values);
        setMode("common");
        setSelectedUnit(null);
    };

    const commonUnitsInCategory = getUnitsByCategory(selectedCategory);

    const categoryOptions = UNIT_CATEGORIES.map((cat) => ({
        label: t(`units.${cat.toLowerCase()}`) || cat,
        value: cat,
    }));

    const unitsForSelect = COMMON_UNITS.map((unit) => ({
        label: `${unit.name} (${unit.symbol})`,
        value: unit.id,
        unit: unit,
    }));

    return (
        <Modal
            title={
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--ohnix-line-2)] border border-[var(--ohnix-line-4)]">
                        <AppstoreOutlined className="text-[#44F3F0]" />
                    </div>
                    <span className="text-lg font-semibold text-[var(--ohnix-text-primary)]">
                        {editingUnit ? t("units.edit_unit") : t("units.add_new_unit")}
                    </span>
                </div>
            }
            open={visible}
            onCancel={onClose}
            footer={null}
            width={Math.min(540, window.innerWidth * 0.9)}
            centered
            className="unit-modal"
            styles={{
                mask: { backgroundColor: "rgba(0,0,0,0.55)" },
                content: {
                    background:
                        "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
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
            {/* During the tour's create-unit step, the "pick a common unit"
                tab is skipped entirely rather than just left unlocked - it
                has its own separate submit path that would let the user
                create a unit other than the practice one the tour is
                waiting for, sidestepping the locked custom-form value. */}
            {!editingUnit && isTourCreateStep && (
                <div className="py-3">
                    <CustomUnitForm
                        form={form}
                        onSubmit={handleSubmit}
                        onCancel={onClose}
                        editingUnit={editingUnit}
                        t={t}
                        locked={isTourCreateStep}
                        submitting={submitting}
                    />
                </div>
            )}

            {editingUnit && team && (
                <>
                    <PresenceLockBar viewers={viewers} lock={lock} currentUserId={user?.id} />
                    <FieldPresenceHighlighter viewers={viewers} currentUserId={user?.id} />
                </>
            )}

            {!isTourCreateStep && (
                <Tabs
                    activeKey={mode}
                    onChange={setMode}
                    items={[
                        {
                            key: "common",
                            label: <span className="text-[var(--ohnix-text-primary)]">{t("units.select_common_unit")}</span>,
                            children: (
                                <div className="space-y-4 py-3">
                                    <Form.Item
                                        label={
                                            <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
                                                {t("units.measurement_type")}
                                            </span>
                                        }
                                        className="mb-4"
                                    >
                                        <Select
                                            value={selectedCategory}
                                            onChange={setSelectedCategory}
                                            options={categoryOptions}
                                            className="w-full"
                                        />
                                    </Form.Item>

                                    <div>
                                        <label className="text-sm font-medium text-[var(--ohnix-text-muted)] block mb-3">
                                            {t("units.common_units")}
                                        </label>
                                        <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto bg-[var(--ohnix-line-1)] p-3 rounded-md border border-[var(--ohnix-line-4)]">
                                            {commonUnitsInCategory.map((unit) => (
                                                <button
                                                    key={unit.id}
                                                    onClick={() => handleSelectCommonUnit(unit)}
                                                    className={`p-3 rounded-lg border text-sm text-left transition-all ${
                                                        selectedUnit?.id === unit.id
                                                            ? "border-[#29D8D5] bg-[#29D8D5]/10 text-[#44F3F0]"
                                                            : "border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] text-[var(--ohnix-text-muted)] hover:border-[#29D8D5]/50 hover:bg-[var(--ohnix-hover-overlay)]"
                                                    }`}
                                                    type="button"
                                                >
                                                    <div className="font-medium">{t(unit.translationKey || unit.name)}</div>
                                                    <div className="text-xs opacity-75">{unit.symbol}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {selectedUnit && (
                                        <Form form={form} layout="vertical" onFinish={handleSubmit}>
                                            <Form.Item
                                                name="unit_name"
                                                className="mb-4"
                                            >
                                                <Input type="hidden" />
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
                                                        {editingUnit ? t("units.update_unit") : t("units.create_unit")}
                                                    </Button>
                                                </div>
                                            </Form.Item>
                                        </Form>
                                    )}
                                </div>
                            ),
                        },
                        {
                            key: "custom",
                            label: <span className="text-[var(--ohnix-text-primary)]">{t("units.create_custom_unit")}</span>,
                            children: (
                                <div className="py-3">
                                    <CustomUnitForm
                                        form={form}
                                        onSubmit={handleSubmit}
                                        onCancel={onClose}
                                        editingUnit={editingUnit}
                                        t={t}
                                        locked={isTourCreateStep}
                                        submitting={submitting}
                                        fieldPresenceHandlers={fieldPresenceHandlers}
                                    />
                                </div>
                            ),
                        },
                    ]}
                    className="unit-modal-tabs"
                />
            )}
        </Modal>
    );
};

const CustomUnitForm = ({ form, onSubmit, onCancel, editingUnit, t, locked, submitting, fieldPresenceHandlers = {} }) => {
    const FORM_RULES = getFormRules(t);

    return (
        <Form
            form={form}
            layout="vertical"
            onFinish={onSubmit}
            className="space-y-6"
            size="large"
            {...fieldPresenceHandlers}
        >
            <Form.Item
                name="unit_name"
                label={
                    <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">
                        {t("units.unit_name")}
                    </span>
                }
                rules={FORM_RULES.UNIT_NAME}
                className="mb-6"
                extra={locked ? t("inventory_tour.practice_locked_hint") : undefined}
            >
                <Input
                    placeholder={t("units.enter_unit_name")}
                    className="h-11 rounded-md auth-ohnix-input"
                    prefix={
                        <AppstoreOutlined className="text-[var(--ohnix-text-dim)] text-sm" />
                    }
                    disabled={locked}
                />
            </Form.Item>

            <Form.Item className="mb-0">
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3 pt-4 border-t border-[var(--ohnix-line-4)]">
                    <Button
                        onClick={onCancel}
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
                        {editingUnit ? t("units.update_unit") : t("units.create_unit")}
                    </Button>
                </div>
            </Form.Item>
        </Form>
    );
};

export default UnitModal;
