import React from "react";
import useI18n from "../../../hooks/useI18n";
import { OhnixMark } from "../../common/OhnixLoader";

// Same grid as the loaded dashboard, so nothing jumps when data arrives -
// the page reads as "filling in" instead of a blank spinner screen.
const Block = ({ className = "" }) => <div className={`ohnix-skeleton ${className}`} />;

const Card = ({ className = "", children }) => (
    <div className={`rounded-2xl border border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-card)] p-5 shadow-[var(--ohnix-shadow-card)] sm:p-6 ${className}`}>
        {children}
    </div>
);

const ListRows = ({ rows = 5 }) => (
    <div className="mt-5 space-y-4">
        {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center justify-between gap-4">
                <Block className="h-3.5 w-1/2" />
                <Block className="h-3.5 w-16" />
            </div>
        ))}
    </div>
);

const DashboardSkeleton = () => {
    const { t } = useI18n();

    return (
        <main
            className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(41,216,213,0.08),transparent_26%),linear-gradient(180deg,var(--ohnix-bg-alt)_0%,var(--ohnix-bg)_100%)]"
            aria-busy="true"
        >
            <div className="mx-auto max-w-7xl px-4 pb-10 pt-6 sm:px-6 lg:px-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="space-y-2.5">
                        <Block className="h-3.5 w-36" />
                        <Block className="h-8 w-64" />
                        <Block className="h-3.5 w-44" />
                    </div>
                    <div role="status" className="flex items-center gap-2.5 text-sm text-[var(--ohnix-text-muted)]">
                        <OhnixMark size={28} />
                        <span className="ohnix-loader__message">{t("dashboard.loading_dashboard_data")}</span>
                    </div>
                </div>

                <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                    {Array.from({ length: 4 }, (_, index) => (
                        <Card key={index} className="!p-5">
                            <div className="flex items-center justify-between">
                                <Block className="h-3.5 w-24" />
                                <Block className="h-9 w-9 !rounded-xl" />
                            </div>
                            <Block className="mt-4 h-7 w-40" />
                            <Block className="mt-4 h-3 w-32" />
                        </Card>
                    ))}
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
                    <Card className="xl:col-span-2">
                        <Block className="h-4 w-40" />
                        <Block className="mt-2 h-3 w-28" />
                        <Block className="mt-6 h-64 w-full sm:h-72 lg:h-80" />
                    </Card>
                    <Card>
                        <Block className="h-4 w-28" />
                        <div className="mt-5 grid grid-cols-3 gap-2">
                            <Block className="h-14" />
                            <Block className="h-14" />
                            <Block className="h-14" />
                        </div>
                        <ListRows />
                    </Card>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                    <Card>
                        <Block className="h-4 w-44" />
                        <ListRows />
                    </Card>
                    <Card>
                        <Block className="h-4 w-36" />
                        <ListRows />
                    </Card>
                </div>
            </div>
        </main>
    );
};

export default DashboardSkeleton;
