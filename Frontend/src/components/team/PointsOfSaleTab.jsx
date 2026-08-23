import React, { useCallback, useEffect, useState } from "react";
import { Button, Modal, Form, Input, Popconfirm, Spin, Tooltip } from "antd";
import {
    PlusOutlined,
    ShopOutlined,
    HomeOutlined,
    ClusterOutlined,
    EditOutlined,
    StopOutlined,
    LockOutlined,
} from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import useSubscription from "../../hooks/useSubscription";
import { useDataInvalidation } from "../../hooks/useDataInvalidation";
import { pointOfSaleService } from "../../services/pointOfSaleService";

const LOCATION_TYPE_ICON = {
    point_of_sale: ShopOutlined,
    warehouse: HomeOutlined,
    distribution_center: ClusterOutlined,
};

const darkModalStyles = {
    mask: { backgroundColor: "rgba(0,0,0,0.55)" },
    content: {
        background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))",
        border: "1px solid rgba(41,216,213,0.18)",
        boxShadow: "0 24px 70px rgba(0,0,0,0.6), 0 0 40px rgba(41,216,213,0.06)",
        borderRadius: "28px",
    },
    header: { background: "transparent", borderBottom: "none", padding: "28px 28px 0" },
    body: { padding: "16px 28px 28px" },
    footer: { padding: "0 28px 24px" },
};

// Escala-only, same "locked upsell vs. real content" split as
// CreateTeamPrompt.jsx uses for teams below Negocio - the plan gate is a
// UI convenience only, every mutation is re-checked server-side
// (enforcePlanFeature('multiLocation'), pricing.middleware.js).
const LockedPointsOfSale = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    return (
        <div className="mx-auto max-w-lg rounded-[28px] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-8 text-center shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
                <LockOutlined className="text-2xl text-[var(--ohnix-text-muted)]" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-[var(--ohnix-text-primary)]">{t("pointOfSale.locked_title")}</h2>
            <p className="mb-6 text-sm text-[var(--ohnix-text-muted)]">{t("pointOfSale.locked_description")}</p>
            <Button
                size="large"
                onClick={() => navigate("/billing")}
                className="h-11 px-8 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200 hover:shadow-[0_0_26px_rgba(41,216,213,0.28)]"
            >
                {t("pointOfSale.locked_cta")}
            </Button>
        </div>
    );
};

const PointsOfSaleTab = () => {
    const { t } = useI18n();
    const { can, loading: planLoading } = useSubscription();
    const [pointsOfSale, setPointsOfSale] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null); // { mode: "create" | "rename", record? }
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await pointOfSaleService.list();
            setPointsOfSale(res?.data || []);
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => {
        load();
    }, [load]);

    // Another tab/team member creating, renaming, or deactivating a
    // location - see pointOfSale.service.js's emitAccountEvent("pointOfSale",
    // ...) calls on every mutation.
    useDataInvalidation("pointOfSale", load);

    const hasFeature = can("multiLocation");
    // A downgraded account may already have created more than one location
    // before losing this feature - a plan change never deletes or hides
    // existing data (same principle MembersTab already follows for team
    // seats over a downgraded limit), so someone in that situation still
    // needs to see/rename/deactivate what they already have. Only an
    // account with nothing to manage yet (<= 1 location) gets the upsell
    // screen. Waits for both loads before deciding, same reasoning as
    // LocationStockPanel's `status` state - deciding on a still-loading
    // `pointsOfSale` would flash the locked screen before the real data
    // arrives.
    if (planLoading || loading) {
        return (
            <div className="flex justify-center py-12">
                <Spin size="large" />
            </div>
        );
    }
    if (!hasFeature && pointsOfSale.length <= 1) {
        return <LockedPointsOfSale />;
    }

    const openCreate = () => {
        form.resetFields();
        setModal({ mode: "create" });
    };

    const openRename = (record) => {
        form.setFieldsValue({ name: record.name });
        setModal({ mode: "rename", record });
    };

    const closeModal = () => {
        setModal(null);
        form.resetFields();
    };

    const handleSubmit = async (values) => {
        setSubmitting(true);
        try {
            if (modal.mode === "create") {
                await pointOfSaleService.create(values.name.trim());
                toast.success(t("pointOfSale.created"));
            } else {
                await pointOfSaleService.rename(modal.record.id, values.name.trim());
                toast.success(t("pointOfSale.renamed"));
            }
            closeModal();
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeactivate = async (record) => {
        try {
            await pointOfSaleService.deactivate(record.id);
            toast.success(t("pointOfSale.deactivated"));
            load();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        }
    };

    return (
        <div>
            <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("pointOfSale.subtitle")}</p>
                <Tooltip title={hasFeature ? "" : t("pointOfSale.locked_create_hint")}>
                    <span>
                        <Button
                            icon={<PlusOutlined />}
                            onClick={openCreate}
                            disabled={!hasFeature}
                            className="h-10 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200 hover:shadow-[0_0_26px_rgba(41,216,213,0.28)]"
                        >
                            {t("pointOfSale.create_cta")}
                        </Button>
                    </span>
                </Tooltip>
            </div>

            {loading ? (
                <div className="flex justify-center py-12">
                    <Spin size="large" />
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {pointsOfSale.map((record, idx) => {
                        const Icon = LOCATION_TYPE_ICON[record.locationType] || ShopOutlined;
                        return (
                            <div
                                key={record.id}
                                className={`hover-lift animate-fade-up stagger-${Math.min(idx + 1, 4)} rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-4 py-4 flex flex-col gap-3`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[linear-gradient(135deg,rgba(41,216,213,0.18),rgba(68,243,240,0.06))] shadow-[0_0_18px_rgba(41,216,213,0.12)]">
                                            <Icon className="text-lg text-[#44F3F0]" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="m-0 font-semibold text-[var(--ohnix-text-primary)] truncate">{record.name}</p>
                                            {record.isDefault && (
                                                <span className="text-[10px] font-semibold uppercase tracking-wide text-[#44F3F0]">
                                                    {t("pointOfSale.default_badge")}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    {record.isActive ? (
                                        <span className="status-pill" style={{ color: "#22c55e", background: "#22c55e18", border: "1px solid #22c55e33" }}>
                                            <span className="status-dot" style={{ background: "#22c55e" }} />
                                            {t("pointOfSale.status_active")}
                                        </span>
                                    ) : (
                                        <span className="status-pill" style={{ color: "#8b98a0", background: "#8b98a018", border: "1px solid #8b98a033" }}>
                                            <span className="status-dot" style={{ background: "#8b98a0" }} />
                                            {t("pointOfSale.status_inactive")}
                                        </span>
                                    )}
                                </div>

                                <div className="flex gap-2 pt-3 mt-auto border-t border-[var(--ohnix-line-3)]">
                                    <Button
                                        icon={<EditOutlined />}
                                        onClick={() => openRename(record)}
                                        className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-[var(--ohnix-line-1)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-soft)] hover:text-[#44F3F0] hover:border-[#44F3F0] hover:bg-[rgba(41,216,213,0.06)] transition-all duration-200"
                                    >
                                        {t("pointOfSale.rename")}
                                    </Button>
                                    {record.isActive && !record.isDefault && (
                                        <Popconfirm
                                            title={t("pointOfSale.deactivate_confirm_title")}
                                            description={t("pointOfSale.deactivate_confirm_content")}
                                            okText={t("common.yes")}
                                            cancelText={t("common.no")}
                                            onConfirm={() => handleDeactivate(record)}
                                        >
                                            <Button
                                                icon={<StopOutlined />}
                                                className="flex-1 h-9 flex items-center justify-center gap-1.5 rounded-lg bg-[rgba(251,113,133,0.06)] border border-[rgba(251,113,133,0.25)] text-[var(--ohnix-status-rose)] hover:bg-[rgba(251,113,133,0.14)] hover:border-[var(--ohnix-status-rose)] transition-all duration-200"
                                            >
                                                {t("pointOfSale.deactivate")}
                                            </Button>
                                        </Popconfirm>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal
                title={null}
                open={Boolean(modal)}
                onCancel={closeModal}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={modal?.mode === "create" ? t("pointOfSale.create_cta") : t("pointOfSale.rename")}
                cancelText={t("common.cancel")}
                okButtonProps={{
                    className:
                        "h-10 px-6 rounded-md bg-gradient-to-r from-[#29D8D5] to-[#44F3F0] border-0 text-[#021314] font-medium transition-all duration-200",
                }}
                cancelButtonProps={{
                    className:
                        "h-10 px-6 rounded-md bg-[var(--ohnix-line-1)] border-[var(--ohnix-line-4)] text-[var(--ohnix-text-primary)] hover:text-[#44F3F0] hover:border-[#44F3F0] transition-colors duration-200",
                }}
                destroyOnClose
                styles={darkModalStyles}
            >
                <div className="mb-6 flex items-center gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[linear-gradient(135deg,rgba(41,216,213,0.18),rgba(68,243,240,0.06))] shadow-[0_0_24px_rgba(41,216,213,0.18)]">
                        <ShopOutlined className="text-2xl text-[#44F3F0]" />
                    </div>
                    <h3 className="m-0 text-xl font-bold text-[var(--ohnix-text-primary)]">
                        {modal?.mode === "create" ? t("pointOfSale.create_modal_title") : t("pointOfSale.rename_modal_title")}
                    </h3>
                </div>

                <Form form={form} layout="vertical" onFinish={handleSubmit}>
                    <Form.Item
                        name="name"
                        label={<span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ohnix-text-muted)]">{t("pointOfSale.name_label")}</span>}
                        rules={[{ required: true, message: t("validation.required_field") }]}
                    >
                        <Input size="large" className="auth-ohnix-input" placeholder={t("pointOfSale.name_placeholder")} maxLength={80} />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    );
};

export default PointsOfSaleTab;
