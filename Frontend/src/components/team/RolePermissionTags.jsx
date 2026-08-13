import React from "react";
import { Tag } from "antd";
import { VISIBLE_MODULE_KEYS } from "../../constants/teamModules";

// Shared by MembersTab (owner view) and MemberOverview (member's own
// read-only view) so "what does this role grant" always renders identically.
const RolePermissionTags = ({ role, t }) => {
    const granted = (role?.permissions || []).filter(
        (p) => p.level !== "none" && VISIBLE_MODULE_KEYS.includes(p.moduleKey)
    );
    if (granted.length === 0) {
        return <span className="text-[11px] text-[var(--ohnix-text-dim)]">{t("team.permission_none")}</span>;
    }
    return (
        <div className="mt-1 flex flex-wrap gap-1">
            {granted.map((p) => (
                <Tag key={p.moduleKey} className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-muted)] text-[10px] m-0">
                    {t(`team.module_${p.moduleKey}`)}: {t(`team.permission_${p.level}`)}
                </Tag>
            ))}
        </div>
    );
};

export default RolePermissionTags;
