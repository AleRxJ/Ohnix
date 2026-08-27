import React from "react";
import { Card, Statistic, Tooltip } from "antd";
import { InfoCircleOutlined } from "@ant-design/icons";

const StatCard = ({
    title,
    value,
    icon,
    prefix,
    suffix,
    precision = 0,
    formatter,
    trend = null,
    trendValue = null,
    trendIcon = null,
    description = null,
    valueStyle = {},
    className = "",
}) => {
    const getTrendColor = () => {
        if (trend === "positive") return "#10b981";
        if (trend === "negative") return "#ef4444";
        return "#6b7280";
    };

    const getTrendText = () => {
        if (trendValue === null) return null;
        return `${trendValue > 0 ? "+" : ""}${trendValue}%`;
    };

    return (
        <Card
            className={`border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-4)] hover:border-[#29D8D5]/35 hover:shadow-[var(--ohnix-shadow-card)] transition-all duration-300 animate-fade-up hover-lift ${className}`}
            bodyStyle={{ padding: 0 }}
            styles={{ body: { padding: 0 } }}
        >
            <div className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                        <span className="text-sm font-medium text-[var(--ohnix-text-muted)] truncate">
                            {title}
                        </span>
                        {description && (
                            <Tooltip title={description}>
                                <InfoCircleOutlined className="text-xs text-[var(--ohnix-text-muted)] flex-shrink-0" />
                            </Tooltip>
                        )}
                    </div>
                    {icon && (
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-[linear-gradient(135deg,rgba(41,216,213,0.2),rgba(68,243,240,0.1))] border border-[#29D8D5]/25 flex-shrink-0 animate-glow-pulse">
                            <span className="text-[#44F3F0] text-lg">
                                {icon}
                            </span>
                        </div>
                    )}
                </div>

                <div className="mb-3 min-w-0">
                    <Statistic
                        value={value}
                        precision={precision}
                        formatter={formatter}
                        prefix={prefix}
                        suffix={suffix}
                        // Fixed 32px used to overflow the card on narrow screens
                        // for large COP amounts (e.g. "$45.320.000") - clamp()
                        // shrinks it down to fit a ~280px-wide mobile card
                        // instead of the number spilling past the card edge,
                        // and overflow-wrap catches whatever's still too wide.
                        valueStyle={{
                            fontSize: "clamp(20px, 5.5vw, 32px)",
                            fontWeight: "700",
                            color: "var(--ohnix-text-primary)",
                            lineHeight: "1.2",
                            overflowWrap: "anywhere",
                            ...valueStyle,
                        }}
                    />
                </div>

                {trend && trendValue !== null && (
                    <div className="flex items-center gap-1">
                        {trendIcon && (
                            <span className="flex-shrink-0">{trendIcon}</span>
                        )}
                        <span
                            className="text-sm font-semibold"
                            style={{ color: getTrendColor() }}
                        >
                            {getTrendText()}
                        </span>
                        <span className="text-xs text-[var(--ohnix-text-muted)] ml-0.5">
                            vs last period
                        </span>
                    </div>
                )}
            </div>
        </Card>
    );
};

export default StatCard;
