import React, { useEffect, useState } from "react";
import { Empty, Spin, Avatar, Tag } from "antd";
import { UserOutlined } from "@ant-design/icons";
import toast from "react-hot-toast";
import useI18n from "../../hooks/useI18n";
import { useTeam } from "../../context/TeamContext";
import { teamService } from "../../services/teamService";

const ACTION_LABELS = {
    "team.created": { es: "creó el equipo", en: "created the team" },
    "team.renamed": { es: "renombró el equipo a", en: "renamed the team to" },
    "invitation.created": { es: "invitó a", en: "invited" },
    "invitation.resent": { es: "reenvió la invitación de", en: "resent the invitation for" },
    "invitation.revoked": { es: "revocó la invitación de", en: "revoked the invitation for" },
    "invitation.accepted": { es: "se unió al equipo", en: "joined the team" },
    "member.role_changed": { es: "cambió el rol de", en: "changed the role of" },
    "member.removed": { es: "removió a", en: "removed" },
    "role.created": { es: "creó el rol", en: "created the role" },
    "role.updated": { es: "actualizó el rol", en: "updated the role" },
    "role.deleted": { es: "eliminó el rol", en: "deleted the role" },
    "ownership.transferred": { es: "transfirió la propiedad del equipo", en: "transferred team ownership" },
};

// Every mutation on the team (invite, role change, removal, rename) is
// logged with enough detail to answer "who did what to whom, and what
// changed" - not just "role was updated". This renders that detail instead
// of a generic one-liner, per the QA request for a real audit trail.
const describeAction = (log, lang, t) => {
    const label = ACTION_LABELS[log.action]?.[lang] || log.action;
    const m = log.metadata || {};
    const target = m.targetUsername || m.targetEmail || m.name || m.toName || "";

    if (log.action === "member.role_changed" && m.fromRoleName && m.toRoleName) {
        return `${label} ${target}: ${m.fromRoleName} → ${m.toRoleName}`;
    }
    if (log.action === "role.updated" && m.fromName && m.toName && m.fromName !== m.toName) {
        return `${label} "${m.fromName}" → "${m.toName}"`;
    }
    return target ? `${label} ${target}` : label;
};

const PermissionChanges = ({ changes, t }) => {
    if (!changes?.length) return null;
    return (
        <div className="mt-1.5 flex flex-wrap gap-1">
            {changes.map((c) => (
                <Tag key={c.moduleKey} className="border-white/10 bg-white/5 text-[#A9B3B8] text-[10px] m-0">
                    {t(`team.module_${c.moduleKey}`)}: {t(`team.permission_${c.from}`)} → {t(`team.permission_${c.to}`)}
                </Tag>
            ))}
        </div>
    );
};

const avatarSrc = (actor) =>
    actor?.avatar?.trim() ||
    `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${encodeURIComponent(actor?.username || "?")}`;

const ActivityTab = () => {
    const { t, currentLanguage } = useI18n();
    const lang = currentLanguage === "es" ? "es" : "en";
    const { team } = useTeam();
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!team) return;
        setLoading(true);
        teamService
            .getActivity(team.id, 50)
            .then((res) => setLogs(res?.data || []))
            .catch((err) => toast.error(err?.response?.data?.message || t("common.error")))
            .finally(() => setLoading(false));
    }, [team, t]);

    if (loading) {
        return (
            <div className="flex justify-center py-10">
                <Spin />
            </div>
        );
    }

    if (logs.length === 0) {
        return <Empty description={t("team.activity_empty")} />;
    }

    return (
        <div className="flex flex-col gap-2">
            {logs.map((log) => (
                <div
                    key={log.id}
                    className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
                >
                    <Avatar src={avatarSrc(log.actor)} icon={<UserOutlined />} size={28} />
                    <div className="flex-1 min-w-0">
                        <p className="m-0 text-sm text-white">
                            <span className="font-semibold">{log.actor?.username || "Ohnix"}</span>{" "}
                            {describeAction(log, lang, t)}
                        </p>
                        {log.action === "role.updated" && (
                            <PermissionChanges changes={log.metadata?.permissionChanges} t={t} />
                        )}
                        <p className="m-0 mt-1 text-xs text-[#A9B3B8]">{new Date(log.createdAt).toLocaleString()}</p>
                    </div>
                </div>
            ))}
        </div>
    );
};

export default ActivityTab;
