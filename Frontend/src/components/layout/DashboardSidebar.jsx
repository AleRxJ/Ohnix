// components/layout/DashboardSidebar.jsx
import React, { useContext, useEffect, useMemo, useState } from "react";
import { Layout, Popover, Skeleton, Tooltip } from "antd";
import {
    SearchOutlined,
    CrownOutlined,
    CheckCircleFilled,
    RightOutlined,
} from "@ant-design/icons";
import { Link, useNavigate } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import useNavItems, { NAV_GROUPS } from "../../hooks/useNavItems";
import useNavSignals, { TONE_RANK } from "../../hooks/useNavSignals";
import useI18n from "../../hooks/useI18n";
import { useTheme } from "../../context/ThemeContext";
import { openCommandPalette, COMMAND_PALETTE_SHORTCUT } from "./commandPaletteEvents";
import { NAV_GROUP_ICONS } from "./navGroupIcons";
import "./navigation.css";

const { Sider } = Layout;

const RAIL_WIDTH = 76;
const EXPANDED_WIDTH = 312;


// Most urgent signal first: alert > warn > info, then bigger counts.
const sortSignals = (a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.count - a.count;
const topTone = (signals) => (signals.length ? [...signals].sort(sortSignals)[0].tone : null);

// Two-level navigation: a rail of business areas (Inicio, Ventas,
// Inventario, ...) plus a contextual panel listing that area's modules with
// live "needs attention" signals read from the offline mirror (see
// useNavSignals). Replaces the old flat 20+ item antd Menu. Collapsed, only
// the rail shows and each area opens as a flyout on hover.
const DashboardSidebar = ({ collapsed, currentPage }) => {
    const { t } = useI18n();
    const { isLite } = useTheme();
    const navigate = useNavigate();
    const { items, loading, can, needsFiscalSetup, openDiscoveriesCount } = useNavItems();
    const signals = useNavSignals({ items, can, needsFiscalSetup, openDiscoveriesCount });

    const groups = useMemo(
        () =>
            NAV_GROUPS.map((key) => {
                const groupItems = items.filter((item) => item.group === key);
                const groupSignals = groupItems.flatMap((item) => signals[item.key] || []);
                return { key, items: groupItems, signals: groupSignals };
            }).filter((group) => group.items.length > 0),
        [items, signals]
    );

    const currentGroup = items.find((item) => item.key === currentPage)?.group || "home";
    // Browsing another area in the panel doesn't navigate - it just previews
    // it. Landing on a new page snaps the panel back to that page's area.
    const [activeGroup, setActiveGroup] = useState(currentGroup);
    useEffect(() => setActiveGroup(currentGroup), [currentGroup]);
    const shownGroup = groups.find((group) => group.key === activeGroup) || groups[0];

    const handleGroupClick = (group) => {
        if (group.items.length === 1) {
            navigate(group.items[0].path);
            return;
        }
        setActiveGroup(group.key);
    };

    return (
        <Sider
            collapsed={collapsed}
            trigger={null}
            theme={isLite ? "light" : "dark"}
            width={EXPANDED_WIDTH}
            collapsedWidth={RAIL_WIDTH}
            className="ohnix-nav hidden md:block no-print overflow-hidden"
            style={{
                height: "100vh",
                position: "sticky",
                top: 0,
                left: 0,
                zIndex: 1000,
                background: "var(--ohnix-surface-sidebar)",
                borderRight: "1px solid var(--ohnix-line-4)",
            }}
        >
            <div className="ohnix-nav__shell">
                <nav className="ohnix-nav__rail" aria-label={t("nav.sections")}>
                    <Link to="/dashboard" className="ohnix-nav__logo" aria-label="Ohnix">
                        {/* The round app icon, not Ohnix_Icon_Transparent.png: that one bakes the
                            "OHNIX" wordmark into the raster, which turns to mush at rail size. */}
                        <img src={isLite ? "/Ohnix_Icon_Lite.png" : "/ohnix-icon-v2-192.png"} alt="" />
                    </Link>

                    <div className="ohnix-nav__rail-groups ohnix-scrollbar-thin">
                        {loading
                            ? Array.from({ length: 5 }).map((_, i) => <span key={i} className="ohnix-nav__rail-skeleton" />)
                            : groups.map((group) => {
                                  const button = (
                                      <RailButton
                                          key={group.key}
                                          group={group}
                                          label={t(`nav.group_${group.key}`)}
                                          isActive={!collapsed && group.key === shownGroup?.key}
                                          isCurrent={group.key === currentGroup}
                                          onClick={() => handleGroupClick(group)}
                                      />
                                  );
                                  if (!collapsed) return button;
                                  return (
                                      <Popover
                                          key={group.key}
                                          placement="rightTop"
                                          arrow={false}
                                          mouseEnterDelay={0.05}
                                          overlayClassName="ohnix-nav-flyout"
                                          content={<GroupPanel group={group} currentPage={currentPage} signals={signals} can={can} compact />}
                                      >
                                          {button}
                                      </Popover>
                                  );
                              })}
                    </div>

                    <Tooltip title={`${t("nav.search")} · ${COMMAND_PALETTE_SHORTCUT}`} placement="right">
                        <button type="button" className="ohnix-nav__rail-search" onClick={openCommandPalette} aria-label={t("nav.search")}>
                            <SearchOutlined />
                        </button>
                    </Tooltip>
                </nav>

                {!collapsed && (
                    <div className="ohnix-nav__panel">
                        <CompanyHeader />
                        <button type="button" className="ohnix-nav__search" onClick={openCommandPalette}>
                            <SearchOutlined />
                            <span className="ohnix-nav__search-text">{t("nav.search_placeholder")}</span>
                            <kbd>{COMMAND_PALETTE_SHORTCUT}</kbd>
                        </button>

                        <div className="ohnix-nav__panel-scroll ohnix-scrollbar-thin">
                            {loading ? (
                                <div className="space-y-3 px-1 py-2">
                                    {Array.from({ length: 5 }).map((_, i) => (
                                        <Skeleton.Input key={i} active size="small" block style={{ height: 20 }} />
                                    ))}
                                </div>
                            ) : (
                                shownGroup && <GroupPanel key={shownGroup.key} group={shownGroup} currentPage={currentPage} signals={signals} can={can} />
                            )}
                        </div>

                        {!loading && <BusinessPulse items={items} signals={signals} />}
                    </div>
                )}
            </div>
        </Sider>
    );
};

const RailButton = React.forwardRef(({ group, label, isActive, isCurrent, onClick, ...rest }, ref) => {
    const tone = topTone(group.signals);
    return (
        <button
            ref={ref}
            type="button"
            onClick={onClick}
            aria-current={isCurrent ? "page" : undefined}
            className={`ohnix-nav__rail-btn ${isActive ? "is-active" : ""} ${isCurrent ? "is-current" : ""}`}
            {...rest}
        >
            <span className="ohnix-nav__rail-icon">
                {NAV_GROUP_ICONS[group.key]}
                {tone && <span className={`ohnix-nav__dot is-${tone}`} />}
            </span>
            <span className="ohnix-nav__rail-label">{label}</span>
        </button>
    );
});
RailButton.displayName = "RailButton";

const CompanyHeader = () => {
    const { user } = useContext(AuthContext);
    const { t } = useI18n();
    const name = user?.company?.name || user?.username || "Ohnix";
    return (
        <div className="ohnix-nav__company">
            <span className="ohnix-nav__company-mark">{name.trim().charAt(0).toUpperCase()}</span>
            <div className="min-w-0">
                <p className="ohnix-nav__company-name" title={name}>{name}</p>
                <p className="ohnix-nav__company-sub">{t("nav.workspace")}</p>
            </div>
        </div>
    );
};

export const GroupPanel = ({ group, currentPage, signals, can, compact = false }) => {
    const { t } = useI18n();
    const pending = group.signals.reduce((sum, signal) => sum + signal.count, 0);
    return (
        <div className={`ohnix-nav__group ${compact ? "is-compact" : ""}`}>
            <div className="ohnix-nav__group-head">
                <h2>{t(`nav.group_${group.key}`)}</h2>
                <p>{pending > 0 ? t("nav.group_pending", { count: pending }) : t(`nav.group_${group.key}_desc`)}</p>
            </div>
            <ul>
                {group.items.map((item, index) => {
                    const itemSignals = [...(signals[item.key] || [])].sort(sortSignals);
                    const locked = item.planFeature && !can(item.planFeature);
                    const isActive = item.key === currentPage;
                    return (
                        <li key={item.key} style={{ "--i": index }}>
                            <Link to={item.path} className={`ohnix-nav__item ${isActive ? "is-active" : ""}`} aria-current={isActive ? "page" : undefined}>
                                <span className="ohnix-nav__item-icon">{item.icon}</span>
                                <span className="ohnix-nav__item-text">
                                    <span className="ohnix-nav__item-label">{t(item.textKey)}</span>
                                    {!locked && itemSignals.length > 0 && (
                                        <span className={`ohnix-nav__item-hint is-${itemSignals[0].tone}`}>
                                            {itemSignals.map((signal) => t(signal.labelKey, { count: signal.count })).join(" · ")}
                                        </span>
                                    )}
                                </span>
                                {locked ? (
                                    <Tooltip title={t("nav.locked_plan")}>
                                        <span className="ohnix-nav__item-lock"><CrownOutlined /></span>
                                    </Tooltip>
                                ) : (
                                    itemSignals.length > 0 && (
                                        <span className={`ohnix-nav__item-count is-${itemSignals[0].tone}`}>
                                            {Math.min(itemSignals.reduce((sum, signal) => sum + signal.count, 0), 99)}
                                        </span>
                                    )
                                )}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
};

// The "what needs me today" card at the foot of the panel - the most urgent
// signals across every area the user can see, one click from each module.
export const BusinessPulse = ({ items, signals }) => {
    const { t } = useI18n();
    // One row per module (its signals joined), most urgent modules first.
    const entries = items
        .filter((item) => signals[item.key])
        .map((item) => ({ item, list: [...signals[item.key]].sort(sortSignals) }))
        .sort((a, b) => sortSignals(a.list[0], b.list[0]))
        .slice(0, 3);

    return (
        <div className="ohnix-nav__pulse">
            <div className="ohnix-nav__pulse-head">
                <span className="ohnix-nav__pulse-live" />
                <span>{t("nav.pulse_title")}</span>
            </div>
            {entries.length === 0 ? (
                <p className="ohnix-nav__pulse-clear">
                    <CheckCircleFilled /> {t("nav.pulse_all_clear")}
                </p>
            ) : (
                <ul>
                    {entries.map(({ item, list }) => (
                        <li key={item.key}>
                            <Link to={item.path} className={`ohnix-nav__pulse-row is-${list[0].tone}`}>
                                <span className="ohnix-nav__pulse-bar" />
                                <span className="ohnix-nav__pulse-text">
                                    <strong>{t(item.textKey)}</strong>
                                    <span>{list.map((signal) => t(signal.labelKey, { count: signal.count })).join(" · ")}</span>
                                </span>
                                <RightOutlined />
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

export default DashboardSidebar;
