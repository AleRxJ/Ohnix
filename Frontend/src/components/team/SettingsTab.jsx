import React, { useContext, useEffect, useState } from "react";
import { Input, Button, Select, Popconfirm, Card, Typography } from "antd";
import { SaveOutlined, SwapOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { teamService } from "../../services/teamService";

const { Text, Title } = Typography;

const SettingsTab = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { team, isOwner, refreshTeam } = useTeam();
    const [name, setName] = useState(team?.name || "");
    const [savingName, setSavingName] = useState(false);
    const [newOwnerId, setNewOwnerId] = useState(null);
    const [transferring, setTransferring] = useState(false);
    const [members, setMembers] = useState([]);

    useEffect(() => {
        setName(team?.name || "");
    }, [team?.name]);

    useEffect(() => {
        if (!team || !isOwner) return;
        teamService.getMembers(team.id).then((res) => setMembers(res?.data || [])).catch(() => {});
    }, [team, isOwner]);

    if (!isOwner) {
        return (
            <Card className="rounded-2xl border border-white/10 bg-white/[0.04] text-white">
                <Text className="text-[#A9B3B8]">{t("team.owner_only_action")}</Text>
            </Card>
        );
    }

    const handleRename = async () => {
        if (!name.trim() || name.trim() === team?.name) return;
        setSavingName(true);
        try {
            await teamService.updateTeam(team.id, { name: name.trim() });
            toast.success(t("team.team_renamed"));
            refreshTeam();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setSavingName(false);
        }
    };

    const handleTransfer = async () => {
        if (!newOwnerId) return;
        setTransferring(true);
        try {
            await teamService.updateTeam(team.id, { newOwnerUserId: newOwnerId });
            toast.success(t("team.ownership_transferred"));
            setNewOwnerId(null);
            refreshTeam();
        } catch (err) {
            toast.error(err?.response?.data?.message || t("common.error"));
        } finally {
            setTransferring(false);
        }
    };

    const otherMembers = (members || []).filter((m) => !m.isOwner && m.userId !== user?.id);

    return (
        <div className="flex flex-col gap-4">
            <Card className="rounded-2xl border border-white/10 bg-white/[0.04] text-white">
                <Title level={5} className="text-white m-0 mb-3">
                    {t("team.rename_label")}
                </Title>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                        size="large"
                        className="auth-ohnix-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={80}
                    />
                    <Button
                        type="primary"
                        size="large"
                        icon={<SaveOutlined />}
                        loading={savingName}
                        disabled={!name.trim() || name.trim() === team?.name}
                        onClick={handleRename}
                    >
                        {t("team.rename_cta")}
                    </Button>
                </div>
            </Card>

            <Card className="rounded-2xl border border-amber-500/20 bg-amber-500/5 text-white">
                <Title level={5} className="text-white m-0 mb-1">
                    {t("team.transfer_ownership_title")}
                </Title>
                <Text className="text-[#A9B3B8] text-sm">{t("team.transfer_ownership_description")}</Text>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                    <Select
                        size="large"
                        className="flex-1"
                        placeholder={t("team.transfer_ownership_select_placeholder")}
                        value={newOwnerId}
                        onChange={setNewOwnerId}
                        options={otherMembers.map((m) => ({ value: m.userId, label: `${m.username} (${m.email})` }))}
                        disabled={otherMembers.length === 0}
                    />
                    <Popconfirm
                        title={t("team.transfer_ownership_confirm_title")}
                        description={t("team.transfer_ownership_confirm_content")}
                        okText={t("common.yes")}
                        cancelText={t("common.no")}
                        onConfirm={handleTransfer}
                        disabled={!newOwnerId}
                    >
                        <Button danger size="large" icon={<SwapOutlined />} loading={transferring} disabled={!newOwnerId}>
                            {t("team.transfer_ownership_cta")}
                        </Button>
                    </Popconfirm>
                </div>
            </Card>
        </div>
    );
};

export default SettingsTab;
