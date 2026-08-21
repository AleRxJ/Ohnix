import React, { useCallback, useEffect, useState } from "react";
import { Button, Table, Tag, Modal, Form, Input, Popconfirm } from "antd";
import { PlusOutlined, ShopOutlined, EditOutlined, StopOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import useSubscription from "../../hooks/useSubscription";
import { pointOfSaleService } from "../../services/pointOfSaleService";

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
            <Button type="primary" size="large" onClick={() => navigate("/billing")}>
                {t("pointOfSale.locked_cta")}
            </Button>
        </div>
    );
};

const PointsOfSaleTab = () => {
    const { t } = useI18n();
    const { can } = useSubscription();
    const [pointsOfSale, setPointsOfSale] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modal, setModal] = useState(null); // { mode: "create" | "rename", record? }
    const [form] = Form.useForm();
    const [submitting, setSubmitting] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
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

    if (!can("multiLocation")) {
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

    const columns = [
        {
            title: t("pointOfSale.col_name"),
            key: "name",
            render: (_, record) => (
                <div className="flex items-center gap-2">
                    <ShopOutlined className="text-[#44F3F0]" />
                    <span className="font-medium text-[var(--ohnix-text-primary)]">{record.name}</span>
                    {record.isDefault && (
                        <Tag className="border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#44F3F0] text-[10px]">
                            {t("pointOfSale.default_badge")}
                        </Tag>
                    )}
                </div>
            ),
        },
        {
            title: t("pointOfSale.col_status"),
            key: "status",
            render: (_, record) =>
                record.isActive ? (
                    <Tag className="border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                        {t("pointOfSale.status_active")}
                    </Tag>
                ) : (
                    <Tag className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-muted)]">
                        {t("pointOfSale.status_inactive")}
                    </Tag>
                ),
        },
        {
            title: t("team.col_actions"),
            key: "actions",
            render: (_, record) => (
                <div className="flex gap-2">
                    <Button size="small" icon={<EditOutlined />} onClick={() => openRename(record)}>
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
                            <Button size="small" danger icon={<StopOutlined />}>
                                {t("pointOfSale.deactivate")}
                            </Button>
                        </Popconfirm>
                    )}
                </div>
            ),
        },
    ];

    return (
        <div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="m-0 text-sm text-[var(--ohnix-text-muted)]">{t("pointOfSale.subtitle")}</p>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreate}
                    className="hover:shadow-[0_0_26px_rgba(41,216,213,0.18)]"
                >
                    {t("pointOfSale.create_cta")}
                </Button>
            </div>

            <Table
                className="module-dark-table"
                rowKey="id"
                columns={columns}
                dataSource={pointsOfSale}
                loading={loading}
                pagination={false}
            />

            <Modal
                title={null}
                open={Boolean(modal)}
                onCancel={closeModal}
                onOk={() => form.submit()}
                confirmLoading={submitting}
                okText={modal?.mode === "create" ? t("pointOfSale.create_cta") : t("pointOfSale.rename")}
                cancelText={t("common.cancel")}
                okButtonProps={{ className: "h-10 px-6 rounded-md font-medium" }}
                cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
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
