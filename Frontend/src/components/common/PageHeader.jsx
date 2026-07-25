import React from "react";
import { Button } from "antd";

const PageHeader = ({
    title,
    subtitle,
    icon,
    actionButton = null,
    onActionClick,
    actionIcon,
    actionText,
}) => {
    return (
        <div className="relative mb-4 overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(145deg,rgba(255,255,255,0.045),rgba(255,255,255,0.012))] px-4 py-4 sm:px-5 sm:py-5 md:px-6 md:py-6 shadow-[0_18px_36px_rgba(0,0,0,0.28)] reveal-card section-glow">
            <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full border border-[#29D8D5]/20" />
            <div className="pointer-events-none absolute -left-10 -bottom-10 h-32 w-32 rounded-full border border-white/8" />
            <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
                <div className="flex-1 min-w-0">
                    <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-[#A9B3B8] animate-fade-up-slow">
                        <span className="h-1.5 w-1.5 rounded-full bg-[#44F3F0] shadow-[0_0_16px_rgba(68,243,240,0.9)]" />
                        {actionText ? "Workflow" : "Overview"}
                    </div>
                    <h1 className="mb-1 flex items-center gap-2 text-xl font-bold leading-tight text-white sm:text-2xl lg:text-3xl animate-fade-up">
                        <span className="truncate">{title}</span>
                        {icon && (
                            <span className="flex-shrink-0 text-lg text-[#44F3F0] sm:text-xl lg:text-2xl animate-glow-pulse">
                                {icon}
                            </span>
                        )}
                    </h1>
                    {subtitle && (
                        <p className="mt-1 pr-2 text-xs leading-relaxed text-[#A9B3B8] sm:pr-0 sm:text-sm md:text-base animate-fade-up-delay">
                            {subtitle}
                        </p>
                    )}
                </div>

                {(actionButton || (onActionClick && actionText)) && (
                    <div className="flex-shrink-0 w-full sm:w-auto">
                        {actionButton || (
                            <Button
                                type="primary"
                                icon={actionIcon}
                                onClick={onActionClick}
                                size="large"
                                className="w-full min-w-[120px] sm:w-auto hover:shadow-[0_0_26px_rgba(41,216,213,0.18)]"
                                block={window.innerWidth < 640}
                            >
                                <span className="truncate">{actionText}</span>
                            </Button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default PageHeader;
