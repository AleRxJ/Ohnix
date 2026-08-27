// components/layout/MobileMenu.jsx
import React, { useEffect, useRef } from "react";
import { Menu, Skeleton } from "antd";
import { getMenuItems } from "../../data";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import useSubscription from "../../hooks/useSubscription";
import { useTheme } from "../../context/ThemeContext";
import ThemeToggle from "../common/ThemeToggle";
import { ELECTRONIC_INVOICING_ENABLED } from "../../config/features";
import useScrollLock from "../../hooks/useScrollLock";

const TEAM_CAPABLE_PLANS = ["growth", "scale", "enterprise"];

const MobileMenu = ({ collapsed, currentPage, onClose }) => {
    const { user } = React.useContext(AuthContext);
    const { team, hasPermission, isTeamMember, loading: teamLoading } = useTeam();
    const { plan } = useSubscription();
    const { t } = useI18n();
    const { isLite } = useTheme();
    const panelRef = useRef(null);
    const showTeam = Boolean(team) || TEAM_CAPABLE_PLANS.includes(plan);
    const showFiscalSetup = ELECTRONIC_INVOICING_ENABLED && (!user?.company || user?.company?.countryCode === "CO") && !isTeamMember;
    const needsFiscalSetup = showFiscalSetup && !user?.company?.electronicInvoicingEnabled;

    useEffect(() => {
        const handlePointerDown = (event) => {
            // Only intercept outside-clicks on mobile — on desktop this listener
            // would otherwise collapse the sidebar whenever the user clicks anywhere.
            if (window.innerWidth >= 768) return;
            if (collapsed) return;
            if (panelRef.current && !panelRef.current.contains(event.target)) {
                onClose?.();
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown, {
            passive: true,
        });

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
        };
    }, [collapsed, onClose]);

    // Lock body scroll while open - this one didn't lock scroll at all
    // before, so the page behind it could still scroll while the menu was
    // open, feeding into the resize-driven auto-close bug in
    // DashboardLayout.jsx (a background scroll on mobile can trigger the
    // browser chrome to hide/show and fire a resize event).
    useScrollLock(!collapsed);

    useEffect(() => {
        if (collapsed) return;
        const handleEscape = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [collapsed, onClose]);

    return (
        <div
            className="md:hidden fixed inset-0 transition-all duration-300 ease-in-out no-print"
            style={{
                opacity: !collapsed ? 1 : 0,
                pointerEvents: !collapsed ? "auto" : "none",
                zIndex: 999,
            }}
        >
            <div
                className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
                onClick={onClose}
            />
            <div
                ref={panelRef}
                className="absolute top-16 left-0 right-0 flex h-[calc(100dvh-4rem)] max-h-[calc(100vh-4rem)] flex-col overflow-hidden border-b border-[var(--ohnix-line-4)] bg-[var(--ohnix-surface-header)] shadow-2xl"
            >
                <div className="px-4 py-3 h-full flex flex-col gap-3">
                    <div className="flex items-center justify-end">
                        <ThemeToggle />
                    </div>
                    <div className="min-h-0 flex-1 rounded-2xl overflow-hidden border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-1)] shadow-inner">
                        <div className="h-full min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-[#29D8D5]/70 scrollbar-track-white/10 hover:scrollbar-thumb-[#44F3F0]">
                            {teamLoading ? (
                                <div className="space-y-3 p-3">
                                    {Array.from({ length: 6 }).map((_, i) => (
                                        <Skeleton.Input key={i} active size="small" block style={{ height: 20 }} />
                                    ))}
                                </div>
                            ) : (
                                <Menu
                                    theme={isLite ? "light" : "dark"}
                                    selectedKeys={[currentPage]}
                                    mode="inline"
                                    items={getMenuItems(
                                        t,
                                        user?.role,
                                        ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO",
                                        showTeam,
                                        hasPermission,
                                        ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && user?.company?.electronicInvoicingProvider === "itcycle",
                                        showFiscalSetup,
                                        needsFiscalSetup
                                    )}
                                    onClick={onClose}
                                    className="border-r-0"
                                    style={{
                                        background: "transparent",
                                        padding: "0.5rem",
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobileMenu;
