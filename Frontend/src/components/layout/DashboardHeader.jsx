// components/layout/DashboardHeader.jsx
import React, { useContext } from "react";
import { Header } from "antd/lib/layout/layout";
import { Avatar, Dropdown } from "antd";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-hot-toast";
import {
    UserOutlined,
    LogoutOutlined,
    SettingOutlined,
    ApartmentOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
} from "@ant-design/icons";
import AuthContext from "../../context/AuthContext";
import useI18n from "../../hooks/useI18n";
import LanguageSwitcher from "../LanguageSwitcher/LanguageSwitcher";
import ThemeToggle from "../common/ThemeToggle";
import SyncStatusIndicator from "../common/SyncStatusIndicator";
import { userService } from "../../services/userService";
import { useTheme } from "../../context/ThemeContext";
import { useTeam } from "../../context/TeamContext";

const DashboardHeader = ({ collapsed, setCollapsed }) => {
    const { user, logout } = useContext(AuthContext);
    const { t, currentLanguage, changeLanguage } = useI18n();
    const { isLite } = useTheme();
    const navigate = useNavigate();

    // Handle logout
    const handleLogout = () => {
        logout();
        navigate("/login");
    };

    // Handle logo click
    const handleLogoClick = () => {
        navigate("/dashboard");
    };

    const handleLanguageSelection = async (language) => {
        if (language !== "en" && language !== "es") {
            return;
        }

        changeLanguage(language);

        try {
            await userService.updatePreferredLanguage(language);
        } catch (_) {
            // Keep current UI language even if persistence fails.
        }
    };

    // Avatar dropdown menu
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

    return (
        <Header
            className="px-6 flex items-center justify-between z-10 sticky top-0 h-16 no-print"
            style={{
                background: "var(--ohnix-surface-header)",
                borderBottom: "1px solid var(--ohnix-line-3)",
                boxShadow: "var(--ohnix-shadow-soft)",
                backdropFilter: "blur(8px)",
            }}
        >
            <div className="flex items-center gap-4">
                {/* Logo for mobile */}
                <div
                    className="cursor-pointer md:hidden"
                    onClick={handleLogoClick}
                >
                    <div className="flex items-center gap-1.5">
                        <img
                            src={isLite ? "/Logo-lite.svg" : "/Ohnix_Icon_Transparent.png"}
                            alt="Ohnix icon"
                            className="h-14 w-14 object-contain"
                        />
                        <span className="text-sm font-semibold tracking-[0.18em] text-[var(--ohnix-text-primary)]">
                            OHNIX
                        </span>
                    </div>
                </div>
                <div className="md:hidden">
                    <button
                        type="button"
                        aria-label={collapsed ? "Abrir menú" : "Cerrar menú"}
                        aria-expanded={!collapsed}
                        title={collapsed ? "Abrir menú" : "Cerrar menú"}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ohnix-line-5)] bg-[var(--ohnix-surface-2)] text-lg text-[var(--ohnix-text-primary)] shadow-sm transition-colors hover:border-[#29D8D5]/60 hover:bg-[var(--ohnix-hover-overlay-strong)] focus:outline-none focus:ring-2 focus:ring-[#29D8D5]/60"
                        onClick={() => setCollapsed(!collapsed)}
                    >
                        {collapsed ? (
                            <MenuUnfoldOutlined />
                        ) : (
                            <MenuFoldOutlined />
                        )}
                    </button>
                </div>

                <div className="hidden md:block">
                    <button
                        type="button"
                        aria-label={collapsed ? "Abrir menú" : "Cerrar menú"}
                        aria-expanded={!collapsed}
                        title={collapsed ? "Abrir menú" : "Cerrar menú"}
                        className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--ohnix-line-5)] bg-[var(--ohnix-surface-2)] text-lg text-[var(--ohnix-text-primary)] shadow-sm transition-colors hover:border-[#29D8D5]/60 hover:bg-[var(--ohnix-hover-overlay-strong)] focus:outline-none focus:ring-2 focus:ring-[#29D8D5]/60"
                        onClick={() => setCollapsed(!collapsed)}
                    >
                        {collapsed ? (
                            <MenuUnfoldOutlined />
                        ) : (
                            <MenuFoldOutlined />
                        )}
                    </button>
                </div>
            </div>

            <div className="flex items-center">
                <div className="mr-2 sm:hidden">
                    <Dropdown
                        menu={{
                            items: [
                                { key: "en", label: "English" },
                                { key: "es", label: "Español" },
                            ],
                            onClick: (e) => {
                                if (e.key === "en" || e.key === "es") {
                                    handleLanguageSelection(e.key);
                                }
                            },
                        }}
                    >
                        <button className="h-9 min-w-9 rounded-full border border-[var(--ohnix-line-5)] bg-[var(--ohnix-surface-2)] px-2 text-xs font-semibold text-[var(--ohnix-text-soft)] hover:border-cyan-400 transition-colors">
                            {currentLanguage === "es" ? "ES" : "EN"}
                        </button>
                    </Dropdown>
                </div>
                <SyncStatusIndicator />
                <div className="mr-2">
                    <ThemeToggle compact />
                </div>
                <div className="mr-3 hidden sm:block">
                    <LanguageSwitcher />
                </div>
                <UserProfileInfo user={user} />
                <UserAvatar user={user} avatarMenu={avatarMenu} />
            </div>
        </Header>
    );
};

const UserProfileInfo = ({ user }) => (
    <UserProfileInfoContent user={user} />
);

const UserProfileInfoContent = ({ user }) => {
    const { isTeamMember } = useTeam();
    const { t } = useI18n();

    return (
    <div className="hidden sm:flex flex-col items-end mr-3 leading-tight">
        <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--ohnix-text-primary)]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_8px_rgba(41,216,213,0.8)]" />
            {user?.username || "User"}
        </span>
        <span className="mt-1 text-[11px] text-[var(--ohnix-text-muted)]">
            {isTeamMember
                ? t("profile.invited_user_account")
                : t("profile.inventory_admin_account")}
        </span>
    </div>
    );
};

const UserAvatar = ({ user, avatarMenu }) => {
    // Generar avatar por defecto si no existe o está vacío
    const getAvatarSrc = () => {
        if (user?.avatar && user.avatar.trim()) {
            let avatarUrl = user.avatar;

            // Si es una ruta relativa local, convertirla a URL HTTP
            if (avatarUrl.startsWith("/") && !avatarUrl.startsWith("//")) {
                // Es una ruta relativa local, agregar el API base URL
                const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || window.location.origin;
                avatarUrl = `${apiBaseUrl}${avatarUrl}`;
            }

            return avatarUrl;
        }
        // Fallback: generar usando ui-avatars.com
        const name = encodeURIComponent(user?.username || "User");
        return `https://ui-avatars.com/api/?background=29D8D5&color=021314&name=${name}&size=128`;
    };
    
    return (
    <Dropdown menu={{ items: avatarMenu }} placement="bottomRight" arrow>
        <button
            type="button"
            aria-label="Abrir menú de usuario"
            className="rounded-full border-0 bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-[#29D8D5]/60"
        >
            <Avatar
                src={getAvatarSrc()}
                style={{
                    background: "linear-gradient(135deg, #29d8d5 0%, #44f3f0 100%)",
                    border: "2px solid var(--ohnix-line-7)",
                    boxShadow: "0 8px 20px rgba(41,216,213,0.25)",
                }}
                icon={<UserOutlined />}
                size="large"
            />
        </button>
    </Dropdown>
    );
};

export default DashboardHeader;
