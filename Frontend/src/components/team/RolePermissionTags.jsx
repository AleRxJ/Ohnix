import React, { useState } from "react";
import { Tag } from "antd";
import { DownOutlined, UpOutlined } from "@ant-design/icons";
import usePermissionCatalog from "../../hooks/usePermissionCatalog";

const LEVEL_ORDER = ["admin", "edit", "view"];

// Above this many granted modules, a full-detail role (eg. an "Admin" role
// with every module checked) turns into a wall of near-identical tags that
// forces the parent table into horizontal scroll. Collapse to a level-count
// summary instead; click to see the module-by-module breakdown.
const COLLAPSE_THRESHOLD = 5;

// Shared by MembersTab (owner view) and MemberOverview (member's own
// read-only view) so "what does this role grant" always renders identically.
const RolePermissionTags = ({ role, t }) => {
    const [expanded, setExpanded] = useState(false);
    const { moduleKeys } = usePermissionCatalog();

    const granted = (role?.permissions || []).filter(
        (p) => p.level !== "none" && moduleKeys.includes(p.moduleKey)
    );

    if (granted.length === 0) {
        return <span className="text-[11px] text-[var(--ohnix-text-dim)]">{t("team.permission_none")}</span>;
    }

    const shouldCollapse = granted.length > COLLAPSE_THRESHOLD;

    if (shouldCollapse && !expanded) {
        const summary = LEVEL_ORDER.map((level) => ({ level, count: granted.filter((p) => p.level === level).length }))
            .filter((g) => g.count > 0)
            .map(({ level, count }) => `${count} ${t(`team.permission_${level}`)}`)
            .join(" · ");

        return (
            <button
                type="button"
                onClick={() => setExpanded(true)}
                title={t("team.permission_expand")}
                className="mt-1 inline-flex items-center gap-1 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] px-2 py-0.5 text-[10px] text-[var(--ohnix-text-muted)] hover:border-[#29D8D5]/40 hover:text-[var(--ohnix-text-primary)]"
            >
                {summary}
                <DownOutlined className="text-[8px]" />
            </button>
        );
    }

    return (
        <div className="mt-1 flex flex-wrap items-center gap-1">
            {granted.map((p) => (
                <Tag key={p.moduleKey} className="border-[var(--ohnix-line-4)] bg-[var(--ohnix-hover-overlay)] text-[var(--ohnix-text-muted)] text-[10px] m-0">
                    {t(`team.module_${p.moduleKey}`)}: {t(`team.permission_${p.level}`)}
                </Tag>
            ))}
            {shouldCollapse && (
                <button
                    type="button"
                    onClick={() => setExpanded(false)}
                    title={t("team.permission_collapse")}
                    className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-primary)]"
                >
                    <UpOutlined className="text-[8px]" />
                </button>
            )}
        </div>
    );
};

export default RolePermissionTags;
