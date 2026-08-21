import React, { useEffect, useState } from "react";
import { Modal, Radio, Select } from "antd";
import { ShopOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

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

// Role answers "what can this member do" (RoleFormModal); this answers
// "where" - a separate, orthogonal choice (see Backend's
// pos.permissions.js). Only rendered by MembersTab when the account
// actually has more than one active Point of Sale - with just one, every
// member's scope is trivially "all of it" and there's nothing to choose.
const MemberScopeModal = ({ open, onCancel, onSubmit, submitting, member, pointsOfSale }) => {
    const { t } = useI18n();
    const [scopeAll, setScopeAll] = useState(true);
    const [selectedIds, setSelectedIds] = useState([]);

    useEffect(() => {
        if (!member) return;
        setScopeAll(member.scopeAll !== false);
        setSelectedIds((member.pointsOfSale || []).map((pos) => pos.id));
    }, [member]);

    const handleOk = () => {
        onSubmit({
            scopeAll,
            pointOfSaleIds: scopeAll ? [] : selectedIds,
        });
    };

    return (
        <Modal
            title={null}
            open={open}
            onCancel={onCancel}
            onOk={handleOk}
            confirmLoading={submitting}
            okText={t("common.save")}
            cancelText={t("common.cancel")}
            okButtonProps={{ className: "h-10 px-6 rounded-md font-medium", disabled: !scopeAll && selectedIds.length === 0 }}
            cancelButtonProps={{ className: "h-10 px-6 rounded-md" }}
            destroyOnClose
            styles={darkModalStyles}
        >
            <div className="mb-6 flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[linear-gradient(135deg,rgba(41,216,213,0.18),rgba(68,243,240,0.06))] shadow-[0_0_24px_rgba(41,216,213,0.18)]">
                    <ShopOutlined className="text-2xl text-[#44F3F0]" />
                </div>
                <h3 className="m-0 text-xl font-bold text-[var(--ohnix-text-primary)]">
                    {t("team.edit_scope_modal_title", { name: member?.username })}
                </h3>
            </div>

            <p className="mb-4 text-sm text-[var(--ohnix-text-muted)]">{t("team.edit_scope_description")}</p>

            <Radio.Group
                className="mb-4 flex flex-col gap-2"
                value={scopeAll}
                onChange={(e) => setScopeAll(e.target.value)}
            >
                <Radio value={true} className="text-[var(--ohnix-text-primary)]">
                    {t("team.edit_scope_all_option")}
                </Radio>
                <Radio value={false} className="text-[var(--ohnix-text-primary)]">
                    {t("team.edit_scope_specific_option")}
                </Radio>
            </Radio.Group>

            {!scopeAll && (
                <Select
                    mode="multiple"
                    size="large"
                    className="w-full"
                    placeholder={t("team.edit_scope_select_placeholder")}
                    value={selectedIds}
                    onChange={setSelectedIds}
                    options={(pointsOfSale || []).map((pos) => ({ value: pos.id, label: pos.name }))}
                />
            )}
        </Modal>
    );
};

export default MemberScopeModal;
