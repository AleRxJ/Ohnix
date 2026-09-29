// components/layout/DashboardHeader.jsx
import { useContext, useEffect, useState } from "react";
import { Header } from "antd/lib/layout/layout";
import { Avatar, Dropdown } from "antd";
import { Link, useNavigate } from "react-router-dom";
import {
    UserOutlined,
    LogoutOutlined,
    SettingOutlined,
    ApartmentOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    SearchOutlined,
    MoonOutlined,
    SunOutlined,
    DownOutlined,
    RightOutlined,
    GlobalOutlined,
} from "@ant-design/icons";
import AuthContext from "../../context/AuthContext";
import useI18n from "../../hooks/useI18n";
import SyncStatusIndicator from "../common/SyncStatusIndicator";
import { openCommandPalette, COMMAND_PALETTE_SHORTCUT } from "./commandPaletteEvents";
import { NAV_GROUP_ICONS } from "./navGroupIcons";
import useNavItems from "../../hooks/useNavItems";
import useNavSignals, { TONE_RANK } from "../../hooks/useNavSignals";
import { userService } from "../../services/userService";
import { useTeam } from "../../context/TeamContext";
import { useTheme } from "../../context/ThemeContext";
import { getConnectivityState, subscribeConnectivity } from "../../offline/connectivity";
import "./navigation.css";

// Same visual language as the sectioned sidebar (DashboardSidebar.jsx):
// breadcrumb "Área › Módulo" with the module's live signal on the left, the
// Ctrl/Cmd+K command bar in the middle, and one compact utility cluster
// (sync, theme, language, user) on the right.
const DashboardHeader = ({ collapsed, setCollapsed, currentPage, pageTitle }) => {
    const { user, logout } = useContext(AuthContext);
    const { t, currentLanguage, changeLanguage } = useI18n();
    const { isLite, setTheme } = useTheme();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    const handleLanguageSelection = async (language) => {
        if (language !== "en" && language !== "es") {
            return;
        }

        changeLanguage(language);

        try {
            await userService.updatePreferredLanguage(language);
        } catch {
            // Keep current UI language even if persistence fails.
        }
    };

    const avatarMenu = [
        {
            key: "profile",
            label: <Link to="/profile">{t("common.profile")}</Link>,
            icon: <UserOutlined />,
        },
        {
            key: "billing",
            label: <Link to="/billing">{t("common.billing")}</Link>,
            icon: <SettingOutlined />,
        },
        ...(user?.role === "admin"
            ? [
                  {
                      key: "admin-management",
                      label: <Link to="/admin/management">{t("common.admin_panel")}</Link>,
                      icon: <ApartmentOutlined />,
                  },
              ]
            : []),
        {
            key: "divider",
            type: "divider",
        },
        {
            key: "logout",
            label: t("common.logout"),
            icon: <LogoutOutlined />,
            onClick: handleLogout,
        },
    ];

    const toggleLabel = collapsed ? t("nav.open_menu") : t("nav.close_menu");

    return (
        <Header className="ohnix-topbar no-print">
            <div className="ohnix-topbar__left">
                {/* Mobile: logo + hamburger (the sidebar is hidden below md). */}
                <Link to="/dashboard" className="ohnix-topbar__mobile-logo ohnix-topbar__mobile-only" aria-label="Ohnix">
                    <img src={isLite ? "/Ohnix_Icon_Lite.png" : "/ohnix-icon-v2-192.png"} alt="" />
                    <span>OHNIX</span>
                </Link>
                <button
                    type="button"
                    aria-label={toggleLabel}
                    aria-expanded={!collapsed}
                    title={toggleLabel}
                    className="ohnix-topbar__icon-btn ohnix-topbar__toggle"
                    onClick={() => setCollapsed(!collapsed)}
                >
                    {collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                </button>
                <Breadcrumb currentPage={currentPage} pageTitle={pageTitle} />
            </div>

            <button type="button" className="ohnix-topbar__command" onClick={openCommandPalette}>
                <SearchOutlined />
                <span className="ohnix-topbar__command-text">{t("nav.command_bar")}</span>
                <kbd>{COMMAND_PALETTE_SHORTCUT}</kbd>
            </button>

            <div className="ohnix-topbar__right">
                <button type="button" aria-label={t("nav.search")} title={t("nav.search")} onClick={openCommandPalette} className="ohnix-topbar__icon-btn ohnix-topbar__mobile-only">
                    <SearchOutlined />
                </button>
                <SyncStatusIndicator />
                <div className="ohnix-topbar__cluster">
                    <button
                        type="button"
                        className="ohnix-topbar__cluster-btn"
                        onClick={() => setTheme(isLite ? "dark" : "lite")}
                        title={isLite ? t("common.theme_dark") : t("common.theme_lite")}
                        aria-label={isLite ? t("common.theme_dark") : t("common.theme_lite")}
                    >
                        <span className="ohnix-topbar__theme-icon" key={isLite ? "lite" : "dark"}>
                            {isLite ? <SunOutlined /> : <MoonOutlined />}
                        </span>
                    </button>
                    <span className="ohnix-topbar__cluster-sep" />
                    <Dropdown
                        trigger={["click"]}
                        placement="bottomRight"
                        menu={{
                            selectedKeys: [currentLanguage],
                            items: [
                                { key: "es", label: "Español" },
                                { key: "en", label: "English" },
                            ],
                            onClick: (e) => handleLanguageSelection(e.key),
                        }}
                    >
                        <button type="button" className="ohnix-topbar__cluster-btn ohnix-topbar__lang" aria-label={t("common.language", { defaultValue: "Idioma" })}>
                            <GlobalOutlined />
                            <span>{currentLanguage === "es" ? "ES" : "EN"}</span>
                        </button>
                    </Dropdown>
                </div>
                <UserChip user={user} avatarMenu={avatarMenu} />
            </div>
        </Header>
    );
};

// "Dinero › Nómina" plus the module's most urgent live signal, so the page
// you're on tells you what's pending in it before you even scroll.
const Breadcrumb = ({ currentPage, pageTitle }) => {
    const { t } = useI18n();
    const { items, can, needsFiscalSetup, openDiscoveriesCount } = useNavItems();
    const signals = useNavSignals({ items, can, needsFiscalSetup, openDiscoveriesCount });
    const item = items.find((entry) => entry.key === currentPage);
    const title = item ? t(item.textKey) : pageTitle;
    if (!title) return null;
    const signal = [...(signals[item?.key] || [])].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone])[0];

    return (
        <nav className="ohnix-topbar__crumbs" aria-label="breadcrumb">
            {item && (
                <>
                    <span className="ohnix-topbar__crumb-icon">{NAV_GROUP_ICONS[item.group]}</span>
                    <span className="ohnix-topbar__crumb-area">{t(`nav.group_${item.group}`)}</span>
                    <RightOutlined className="ohnix-topbar__crumb-sep" />
                </>
            )}
            <span className="ohnix-topbar__crumb-page" aria-current="page">{title}</span>
            {signal && (
                <span className={`ohnix-topbar__crumb-signal is-${signal.tone}`}>
                    <span className="ohnix-topbar__crumb-dot" />
                    {t(signal.labelKey, { count: signal.count })}
                </span>
            )}
        </nav>
    );
};

const getAvatarSrc = (user) => {
    if (user?.avatar && user.avatar.trim()) {
        let avatarUrl = user.avatar;
        // Relative local path -> absolute URL on the API host.
        if (avatarUrl.startsWith("/") && !avatarUrl.startsWith("//")) {
            const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
            avatarUrl = `${apiBaseUrl}${avatarUrl}`;
        }
        return avatarUrl;
    }
    const name = encodeURIComponent(user?.username || "User");
    return `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${name}&size=128`;
};

const UserChip = ({ user, avatarMenu }) => {
    const { isTeamMember } = useTeam();
    const { t } = useI18n();
    // Presence dot mirrors real connectivity (same source SyncStatusIndicator uses).
    const [online, setOnline] = useState(getConnectivityState());
    useEffect(() => subscribeConnectivity(setOnline), []);

    return (
        <Dropdown menu={{ items: avatarMenu }} placement="bottomRight" trigger={["click"]}>
            <button type="button" aria-label={t("nav.user_menu")} className="ohnix-topbar__user">
                <span className="ohnix-topbar__avatar">
                    <Avatar src={getAvatarSrc(user)} icon={<UserOutlined />} size={32} style={{ background: "linear-gradient(135deg, #29d8d5 0%, #44f3f0 100%)" }} />
                    <span className={`ohnix-topbar__presence ${online ? "" : "is-offline"}`} title={online ? undefined : t("common.offline_offline")} />
                </span>
                <span className="ohnix-topbar__user-text">
                    <strong>{user?.username || "User"}</strong>
                    <span>{isTeamMember ? t("profile.invited_user_account") : t("profile.inventory_admin_account")}</span>
                </span>
                <DownOutlined className="ohnix-topbar__user-caret" />
            </button>
        </Dropdown>
    );
};

export default DashboardHeader;
