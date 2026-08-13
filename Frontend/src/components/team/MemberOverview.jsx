import React, { useContext, useEffect, useState } from "react";
import { Avatar, Spin, Tag } from "antd";
import { CrownOutlined, UserOutlined, IdcardOutlined, UsergroupAddOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import { teamService } from "../../services/teamService";
import RolePermissionTags from "./RolePermissionTags";

const avatarSrc = (person) =>
    person?.avatar?.trim() ||
    `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${encodeURIComponent(person?.username || "?")}`;

// Read-only view for a non-owner member: their team, their own role and
// exactly what it grants, the owner, and their teammates - nothing they can
// edit here, so it needs no module permission at all (see team.routes.js:
// "can I see my own team" is not the same rule as "can I administer it").
const MemberOverview = () => {
    const { t } = useI18n();
    const { user } = useContext(AuthContext);
    const { team, myRole } = useTeam();
    const [members, setMembers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!team) return;
        setLoading(true);
        teamService
            .getMembers(team.id)
            .then((res) => setMembers(res?.data || []))
            .catch((err) => toast.error(err?.response?.data?.message || t("common.error")))
            .finally(() => setLoading(false));
    }, [team, t]);

    if (loading) {
        return (
            <div className="flex justify-center py-16">
                <Spin size="large" />
            </div>
        );
    }

    const owner = members.find((m) => m.isOwner);
    const teammates = members.filter((m) => !m.isOwner && m.userId !== user?.id);

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="rounded-[28px] border border-[#29D8D5]/25 bg-[linear-gradient(145deg,rgba(41,216,213,0.08),rgba(255,255,255,0.02))] p-6 lg:col-span-1">
                <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[var(--ohnix-text-muted)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#44F3F0] shadow-[0_0_10px_rgba(68,243,240,0.9)]" />
                    {t("team.your_role_title")}
                </div>
                <h3 className="mb-1 text-xl font-bold text-[var(--ohnix-text-primary)]">{myRole?.name || t("common.na")}</h3>
                <p className="mb-4 text-xs text-[var(--ohnix-text-muted)]">{t("team.your_role_description")}</p>
                {myRole && <RolePermissionTags role={myRole} t={t} />}
            </div>

            <div className="rounded-[28px] border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-6 lg:col-span-2">
                <div className="mb-4 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ohnix-text-muted)]">
                    <IdcardOutlined /> {t("team.owner_badge")}
                </div>
                {owner && (
                    <div className="mb-6 flex items-center gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                        <Avatar src={avatarSrc(owner)} icon={<UserOutlined />} size={44} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="m-0 font-semibold text-[var(--ohnix-text-primary)]">{owner.username}</p>
                                <Tag className="border-amber-500/40 bg-amber-500/10 text-amber-300 text-[10px] m-0">
                                    <CrownOutlined className="mr-1" />
                                    {t("team.owner_badge")}
                                </Tag>
                            </div>
                            <p className="m-0 truncate text-xs text-[var(--ohnix-text-muted)]">{owner.email}</p>
                        </div>
                    </div>
                )}

                <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--ohnix-text-muted)]">
                    <UsergroupAddOutlined /> {t("team.tab_members")}
                </div>
                {teammates.length === 0 ? (
                    <p className="text-sm text-[var(--ohnix-text-dim)]">{t("team.no_teammates_yet")}</p>
                ) : (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {teammates.map((m) => (
                            <div
                                key={m.userId}
                                className="flex items-center gap-3 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-3"
                            >
                                <Avatar src={avatarSrc(m)} icon={<UserOutlined />} size={36} />
                                <div className="min-w-0">
                                    <p className="m-0 truncate text-sm font-medium text-[var(--ohnix-text-primary)]">{m.username}</p>
                                    <p className="m-0 truncate text-[11px] text-[var(--ohnix-text-muted)]">{m.role?.name}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default MemberOverview;
