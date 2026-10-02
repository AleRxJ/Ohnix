import React from "react";
import { Link } from "react-router-dom";
import { ArrowRightOutlined } from "@ant-design/icons";

// Shared shell for the dashboard's secondary cards: title, optional
// subtitle, and a "Ver todo" link to the full module.
const OverviewCard = ({ title, subtitle, linkTo, linkLabel, children, className = "" }) => (
    <section className={`flex h-full min-w-0 flex-col rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-5 shadow-[var(--ohnix-shadow-card)] sm:p-6 ${className}`}>
        <header className="mb-4 flex items-start justify-between gap-3">
            <div className="min-w-0">
                <h2 className="m-0 text-base font-semibold text-[var(--ohnix-text-primary)]">{title}</h2>
                {subtitle && <p className="m-0 mt-0.5 text-xs text-[var(--ohnix-text-muted)]">{subtitle}</p>}
            </div>
            {linkTo && (
                <Link
                    to={linkTo}
                    className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-[#29D8D5] hover:text-[#44F3F0]"
                >
                    {linkLabel}
                    <ArrowRightOutlined className="text-[10px]" />
                </Link>
            )}
        </header>
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
);

export default OverviewCard;
