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
// live/locks.js on the backend for why this stays advisory, and
// optimisticConcurrency.js on the backend for what actually stops a
// same-time save from silently overwriting someone else's).
//
// The "locked by someone else" state gets its own full-width banner instead
// of a small pill - a subtle pill next to a form full of fields was easy to
// open without ever noticing, which is exactly the "I had to close the
// modal to realize" complaint this replaces.
const PresenceLockBar = ({ viewers = [], lock, currentUserId }) => {
    const { t } = useI18n();
    const others = viewers.filter((v) => v.userId !== currentUserId);
    const lockedByOther = lock && lock.userId !== currentUserId;

    if (others.length === 0 && !lock) return null;

    return (
        <div className="mb-4 space-y-2">
            {lockedByOther && (
                <div className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-400" />
                    </span>
                    <LockOutlined className="text-[var(--ohnix-alert-amber-text)] text-base shrink-0" />
                    <span className="text-sm font-semibold text-[var(--ohnix-alert-amber-text)]">
                        {t("team.lock_held_by", { name: lock.username })}
                    </span>
                </div>
            )}

            {(others.length > 0 || (lock && lock.userId === currentUserId)) && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] px-3 py-2">
                    {others.length > 0 && (
                        <div className="flex items-center gap-2">
                            <Avatar.Group max={{ count: 4 }}>
                                {others.map((v) => (
                                    <Tooltip key={v.userId} title={v.username}>
                                        <Avatar src={avatarSrc(v)} size={26} icon={<UserOutlined />} />
                                    </Tooltip>
                                ))}
                            </Avatar.Group>
                            <span className="text-xs text-[var(--ohnix-text-muted)]">{t("team.presence_viewing")}</span>
                        </div>
                    )}

                    {lock && lock.userId === currentUserId && (
                        <div className="flex items-center gap-2 rounded-full border border-[#29D8D5]/30 bg-[#29D8D5]/10 px-3 py-1">
                            <LockOutlined className="text-[#44F3F0] text-xs" />
                            <span className="text-xs font-medium text-[#44F3F0]">{t("team.lock_own")}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default PresenceLockBar;
