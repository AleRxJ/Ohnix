import React from "react";
import { Avatar, Tooltip } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const avatarSrc = (viewer) =>
    viewer?.avatar?.trim() ||
    `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${encodeURIComponent(viewer?.username || "?")}`;

// Drop this at the top of any edit modal/drawer once you have a real
// resourceId (see hooks/useResourcePresence.js). Shows who else is looking
// at this exact record right now, and whether someone else has it locked
// for editing (soft-lock, not a hard block at the data layer - see
// live/locks.js on the backend for why).
const PresenceLockBar = ({ viewers = [], lock, currentUserId }) => {
    const { t } = useI18n();
    const others = viewers.filter((v) => v.userId !== currentUserId);
    const lockedByOther = lock && lock.userId !== currentUserId;

    if (others.length === 0 && !lock) return null;

    return (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
            {others.length > 0 && (
                <div className="flex items-center gap-2">
                    <Avatar.Group max={{ count: 4 }}>
                        {others.map((v) => (
                            <Tooltip key={v.userId} title={v.username}>
                                <Avatar src={avatarSrc(v)} size={26} icon={<UserOutlined />} />
                            </Tooltip>
                        ))}
                    </Avatar.Group>
                    <span className="text-xs text-[#A9B3B8]">{t("team.presence_viewing")}</span>
                </div>
            )}

            {lockedByOther && (
                <div className="flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1">
                    <LockOutlined className="text-amber-300 text-xs" />
                    <span className="text-xs font-medium text-amber-200">
                        {t("team.lock_held_by", { name: lock.username })}
                    </span>
                </div>
            )}

            {lock && lock.userId === currentUserId && (
                <div className="flex items-center gap-2 rounded-full border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-3 py-1">
                    <LockOutlined className="text-[#44F3F0] text-xs" />
                    <span className="text-xs font-medium text-[#44F3F0]">{t("team.lock_own")}</span>
                </div>
            )}
        </div>
    );
};

export default PresenceLockBar;
