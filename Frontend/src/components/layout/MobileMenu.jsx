// components/layout/MobileMenu.jsx
import React, { useEffect, useRef } from "react";
import { Menu, Skeleton } from "antd";
import { CloseOutlined } from "@ant-design/icons";
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

const MobileMenu = ({ collapsed, currentPage, onClose, isMobile }) => {
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
    useScrollLock(isMobile && !collapsed);

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
                className="absolute inset-0 bg-black/55 backdrop-blur-[4px]"
                onClick={onClose}
            />
            <div
                ref={panelRef}
                className="ohnix-mobile-menu absolute bottom-3 left-3 right-3 top-20 flex max-h-[calc(100dvh-5.75rem)] flex-col overflow-hidden rounded-2xl border border-[var(--ohnix-line-4)] shadow-2xl"
            >
                <div className="px-4 py-3 h-full flex flex-col gap-3">
                    <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2.5">
                            <div
                                className="flex items-center justify-center rounded-lg p-1"
                                style={isLite ? { background: "linear-gradient(180deg, #0b0b0b 0%, #0a1114 100%)" } : undefined}
                            >
                                <img
                                    src={isLite ? "/Logo-lite.svg" : "/Ohnix_Icon_Transparent.png"}
                                    alt=""
                                    aria-hidden="true"
                                    className="h-9 w-9 object-contain"
                                />
                            </div>
                            <span className="text-sm font-semibold tracking-wide text-[var(--ohnix-text-primary)]">
                                Menú
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <ThemeToggle />
                            <button
                                type="button"
                                onClick={onClose}
                                aria-label="Cerrar menú"
                                title="Cerrar menú"
                                className="ohnix-mobile-menu-close inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--ohnix-line-5)] bg-[var(--ohnix-hover-overlay)] text-base text-[var(--ohnix-text-soft)] transition-colors hover:border-[#29D8D5]/60 hover:bg-[var(--ohnix-hover-overlay-strong)] hover:text-[var(--ohnix-text-primary)] focus:outline-none focus:ring-2 focus:ring-[#29D8D5]/60"
                            >
                                <CloseOutlined />
                            </button>
                        </div>
                    </div>
                    <div className="ohnix-scrollbar-thin min-h-0 flex-1 touch-pan-y overscroll-contain overflow-y-auto">
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
                                    // Same gate as DashboardSidebar.jsx - only once
                                    // the company actually activated invoicing, not
                                    // just for being Colombian.
                                    ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && Boolean(user?.company?.electronicInvoicingEnabled),
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
                                    padding: "0.5rem 0",
                                }}
                            />
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobileMenu;
