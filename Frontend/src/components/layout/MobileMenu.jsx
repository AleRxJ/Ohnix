// components/layout/MobileMenu.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import { Skeleton } from "antd";
import { CloseOutlined, SearchOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import useNavItems, { NAV_GROUPS } from "../../hooks/useNavItems";
import useNavSignals, { TONE_RANK } from "../../hooks/useNavSignals";
import useScrollLock from "../../hooks/useScrollLock";
import { GroupPanel, BusinessPulse } from "./DashboardSidebar";
import { NAV_GROUP_ICONS } from "./navGroupIcons";
import { openCommandPalette } from "./commandPaletteEvents";
import "./navigation.css";
import OhnixAppIcon from "../common/OhnixAppIcon";

const topTone = (signals) => (signals.length ? [...signals].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])[0].tone : null);

// Mobile counterpart of the sectioned sidebar (DashboardSidebar.jsx): the
// same areas, module rows, live signals and business pulse, laid out as a
// sheet - areas become a swipeable chip row instead of a vertical rail.
const MobileMenu = ({ collapsed, currentPage, onClose, isMobile }) => {
    const { t } = useI18n();
    const { items, loading, can, needsFiscalSetup, openDiscoveriesCount } = useNavItems();
    const signals = useNavSignals({ items, can, needsFiscalSetup, openDiscoveriesCount });
    const panelRef = useRef(null);
    const chipsRef = useRef(null);

    const groups = useMemo(
        () =>
            NAV_GROUPS.map((key) => {
                const groupItems = items.filter((item) => item.group === key);
                return { key, items: groupItems, signals: groupItems.flatMap((item) => signals[item.key] || []) };
            }).filter((group) => group.items.length > 0),
        [items, signals]
    );
    const currentGroup = items.find((item) => item.key === currentPage)?.group || "home";
    const [activeGroup, setActiveGroup] = useState(currentGroup);
    // Reopening the menu starts on the area of the page you're on.
    useEffect(() => {
        if (!collapsed) setActiveGroup(currentGroup);
    }, [collapsed, currentGroup]);
    const shownGroup = groups.find((group) => group.key === activeGroup) || groups[0];

    // Keep the active chip in view when it changes (and once loading ends -
    // the chips only exist after permissions/plan resolve).
    useEffect(() => {
        chipsRef.current?.querySelector(".is-active")?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [activeGroup, collapsed, loading]);

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

    // Lock body scroll while open - otherwise a background scroll on mobile
    // can make the browser chrome hide/show and fire the resize event that
    // DashboardLayout.jsx listens to.
    useScrollLock(isMobile && !collapsed);

    useEffect(() => {
        if (collapsed) return;
        const handleEscape = (e) => {
            if (e.key === "Escape") onClose?.();
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [collapsed, onClose]);

    // Any module link (list or pulse card) closes the sheet.
    const handleLinkClick = (event) => {
        if (event.target.closest("a")) onClose?.();
    };

    const handleSearch = () => {
        onClose?.();
        openCommandPalette();
    };

    return (
        <div
            className="md:hidden fixed inset-0 transition-all duration-300 ease-in-out no-print"
            style={{
                opacity: !collapsed ? 1 : 0,
                pointerEvents: !collapsed ? "auto" : "none",
                zIndex: 999,
            }}
        >
            <div className="absolute inset-0 bg-black/55 backdrop-blur-[4px]" onClick={onClose} />
            <div
                ref={panelRef}
                className={`ohnix-nav ohnix-mobile-nav ${collapsed ? "" : "is-open"}`}
                role="dialog"
                aria-modal="true"
                aria-label={t("nav.sections")}
                onClick={handleLinkClick}
            >
                <div className="ohnix-mobile-nav__head">
                    <OhnixAppIcon />
                    <button type="button" className="ohnix-nav__search" onClick={handleSearch}>
                        <SearchOutlined />
                        <span className="ohnix-nav__search-text">{t("nav.search_placeholder")}</span>
                    </button>
                    <button type="button" onClick={onClose} aria-label={t("nav.close_menu")} title={t("nav.close_menu")} className="ohnix-mobile-nav__close">
                        <CloseOutlined />
                    </button>
                </div>

                {loading ? (
                    <div className="space-y-3 p-3">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton.Input key={i} active size="small" block style={{ height: 20 }} />
                        ))}
                    </div>
                ) : (
                    <>
                        <div className="ohnix-mobile-nav__chips" ref={chipsRef} role="tablist">
                            {groups.map((group) => {
                                const tone = topTone(group.signals);
                                const active = group.key === shownGroup?.key;
                                return (
                                    <button
                                        key={group.key}
                                        type="button"
                                        role="tab"
                                        aria-selected={active}
                                        className={`ohnix-mobile-nav__chip ${active ? "is-active" : ""} ${group.key === currentGroup ? "is-current" : ""}`}
                                        onClick={() => setActiveGroup(group.key)}
                                    >
                                        <span className="ohnix-mobile-nav__chip-icon">
                                            {NAV_GROUP_ICONS[group.key]}
                                            {tone && <span className={`ohnix-nav__dot is-${tone}`} />}
                                        </span>
                                        {t(`nav.group_${group.key}`)}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="ohnix-mobile-nav__list ohnix-scrollbar-thin" role="tabpanel">
                            {shownGroup && <GroupPanel key={shownGroup.key} group={shownGroup} currentPage={currentPage} signals={signals} can={can} />}
                        </div>

                        <div className="ohnix-mobile-nav__pulse">
                            <BusinessPulse items={items} signals={signals} />
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default MobileMenu;
