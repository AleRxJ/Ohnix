import React, { useState } from "react";
import { Input, Button } from "antd";
import { UsergroupAddOutlined, LockOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { teamService } from "../../services/teamService";

const CreateTeamPrompt = ({ planSupportsTeams }) => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const { refreshTeam } = useTeam();
    const [name, setName] = useState("");
    const [submitting, setSubmitting] = useState(false);

    if (!planSupportsTeams) {
        return (
            <div className="mx-auto max-w-lg rounded-[28px] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-8 text-center shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)]">
                    <LockOutlined className="text-2xl text-[var(--ohnix-text-muted)]" />
                </div>
                <h2 className="mb-2 text-xl font-bold text-[var(--ohnix-text-primary)]">{t("team.create_locked_title")}</h2>
                <p className="mb-6 text-sm text-[var(--ohnix-text-muted)]">{t("team.create_locked_description")}</p>
                <Button
                    type="primary"
                    size="large"
                    onClick={() => navigate("/billing")}
                    className="hover:shadow-[0_0_26px_rgba(41,216,213,0.18)]"
                >
                    {t("team.create_locked_cta")}
                </Button>
            </div>
        );
    }

    const handleCreate = async () => {
        if (!name.trim()) return;
        setSubmitting(true);
        try {
            await teamService.createTeam(name.trim());
            await refreshTeam();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="mx-auto max-w-lg rounded-[28px] border border-[var(--ohnix-line-4)] bg-[linear-gradient(145deg,rgba(41,216,213,0.06),rgba(255,255,255,0.02))] p-8 text-center shadow-[0_18px_36px_rgba(0,0,0,0.28)]">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-[#29D8D5]/30 bg-[#29D8D5]/10">
                <UsergroupAddOutlined className="text-2xl text-[#44F3F0]" />
            </div>
            <h2 className="mb-2 text-xl font-bold text-[var(--ohnix-text-primary)]">{t("team.create_title")}</h2>
            <p className="mb-6 text-sm text-[var(--ohnix-text-muted)]">{t("team.create_description")}</p>
            <div className="flex flex-col gap-3 sm:flex-row">
                <Input
                    size="large"
                    className="auth-ohnix-input"
                    placeholder={t("team.create_name_placeholder")}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={80}
                    onPressEnter={handleCreate}
                />
                <Button
                    type="primary"
                    size="large"
                    loading={submitting}
                    disabled={!name.trim()}
                    onClick={handleCreate}
                    className="hover:shadow-[0_0_26px_rgba(41,216,213,0.18)]"
                >
                    {t("team.create_cta")}
                </Button>
            </div>
        </div>
    );
};

export default CreateTeamPrompt;
