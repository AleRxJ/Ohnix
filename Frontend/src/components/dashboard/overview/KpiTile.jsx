import React from "react";
import { ArrowUpOutlined, ArrowDownOutlined } from "@ant-design/icons";

// Headline number + optional change vs the previous period. `change` is a
// percentage or null (no baseline to compare against - shows `hint` instead).
// `invertChange` is for metrics where going down is the good direction.
const KpiTile = ({ label, value, icon, change = null, changeLabel, hint, invertChange = false }) => {
    const hasChange = change !== null && Number.isFinite(change);
    const isUp = hasChange && change > 0.05;
    const isDown = hasChange && change < -0.05;
    const isGood = invertChange ? isDown : isUp;
    const isBad = invertChange ? isUp : isDown;
    const changeTone = isGood
        ? "text-[#34D399] bg-[#34D399]/10"
        : isBad
          ? "text-[#F28B82] bg-[#F28B82]/10"
          : "text-[var(--ohnix-text-muted)] bg-[var(--ohnix-line-2)]";

    return (
        <div className="flex h-full min-w-0 flex-col rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-5 shadow-[var(--ohnix-shadow-card)]">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-[var(--ohnix-text-muted)]">{label}</span>
                {icon && (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[#29D8D5]/25 bg-[#29D8D5]/10 text-base text-[#44F3F0]">
                        {icon}
                    </span>
                )}
            </div>
            <div className="mt-3 text-[clamp(22px,5.5vw,30px)] font-bold leading-tight tabular-nums text-[var(--ohnix-text-primary)] [overflow-wrap:anywhere]">
                {value}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-2 pt-3 text-xs">
                {hasChange ? (
                    <>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-semibold tabular-nums ${changeTone}`}>
                            {isUp && <ArrowUpOutlined />}
                            {isDown && <ArrowDownOutlined />}
                            {change > 0 ? "+" : ""}
                            {change.toFixed(1)}%
                        </span>
                        <span className="text-[var(--ohnix-text-muted)]">{changeLabel}</span>
                    </>
                ) : (
                    hint && <span className="text-[var(--ohnix-text-muted)]">{hint}</span>
                )}
            </div>
        </div>
    );
};

export default KpiTile;
