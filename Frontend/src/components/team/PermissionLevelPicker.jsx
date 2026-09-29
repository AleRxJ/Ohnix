import React from "react";
import { Tooltip } from "antd";
import { LEVEL_COLORS, tint } from "../../constants/permissionLevels";

// Four-way segmented control for one module's level. Works as a Form.Item
// child (value/onChange). A radiogroup for keyboard/screen-reader users.
const PermissionLevelPicker = ({ value = "none", onChange, levels, t, disabled = false }) => (
    <div
        role="radiogroup"
        className="inline-flex shrink-0 rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] p-0.5"
    >
        {levels.map((level) => {
            const active = value === level;
            const color = LEVEL_COLORS[level];
            return (
                <Tooltip key={level} title={t(`team.level_hint_${level}`)} mouseEnterDelay={0.5}>
                    <button
                        type="button"
                        role="radio"
                        aria-checked={active}
                        disabled={disabled}
                        onClick={() => !active && onChange?.(level)}
                        className="rounded-full px-2.5 py-1 text-[11px] font-medium leading-none transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#29D8D5] disabled:cursor-not-allowed"
                        style={
                            active
                                ? { color: level === "none" ? "var(--ohnix-text-muted)" : color, background: tint(color, level === "none" ? 14 : 18), boxShadow: `inset 0 0 0 1px ${tint(color, 45)}` }
                                : { color: "var(--ohnix-text-dim)" }
                        }
                    >
                        {t(`team.permission_${level}`)}
                    </button>
                </Tooltip>
            );
        })}
    </div>
);

export default PermissionLevelPicker;
