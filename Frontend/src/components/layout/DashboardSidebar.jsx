// components/layout/DashboardSidebar.jsx
import React, { useContext } from "react";
import { Layout, Menu, Avatar, Skeleton } from "antd";
import { UserOutlined, LogoutOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import AuthContext from "../../context/AuthContext";
import { useTeam } from "../../context/TeamContext";
import useSubscription from "../../hooks/useSubscription";
import { getMenuItems } from "../../data";
import useI18n from "../../hooks/useI18n";
import { useTheme } from "../../context/ThemeContext";
import { ELECTRONIC_INVOICING_ENABLED } from "../../config/features";

const { Sider } = Layout;

const TEAM_CAPABLE_PLANS = ["growth", "scale", "enterprise"];

const DashboardSidebar = ({ collapsed, setCollapsed, currentPage }) => {
    const { user, logout } = useContext(AuthContext);
    const { team, hasPermission, loading: teamLoading } = useTeam();
    const { plan } = useSubscription();
    const { t } = useI18n();
    const { isLite } = useTheme();
    const navigate = useNavigate();
    const showTeam = Boolean(team) || TEAM_CAPABLE_PLANS.includes(plan);

    const handleLogoClick = () => {
        navigate("/dashboard");
    };

    const handleLogout = async () => {
        await logout();
        navigate("/login");
    };

    return (
        <Sider
            collapsible
            collapsed={collapsed}
            onCollapse={setCollapsed}
            trigger={null}
            theme={isLite ? "light" : "dark"}
            width={260}
            className="hidden md:block no-print"
            style={{
                overflowY: "auto",
                height: "100vh",
                position: "sticky",
                top: 0,
                left: 0,
                zIndex: 1000,
                background: "var(--ohnix-surface-sidebar)",
                borderRight: "1px solid var(--ohnix-line-4)",
            }}
        >
            <SidebarLogo collapsed={collapsed} onClick={handleLogoClick} />
            <div className="mx-4 mb-4 h-px bg-[var(--ohnix-line-4)]"></div>

            <div className="px-3">
                {teamLoading ? (
                    // Never render the unfiltered menu while permissions are
                    // still resolving - a restricted member briefly seeing
                    // (and then losing) items they can't use was the "menu
                    // flicker" bug. A few skeleton bars is a fixed, tiny cost
                    // instead of a visible flash of the wrong menu.
                    <div className="space-y-3 px-2 py-2">
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
                            ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && user?.company?.electronicInvoicingProvider === "itcycle"
                        ).map((item) => ({
                            ...item,
                        }))}
                        className="border-r-0"
                        style={{
                            background: "transparent",
                        }}
                    />
                )}
            </div>

            {!collapsed && <SidebarUserProfile user={user} logout={handleLogout} t={t} />}
        </Sider>
    );
};

const SidebarLogo = ({ collapsed, onClick }) => (
    <div
        className="flex items-center justify-center px-4 py-6 cursor-pointer group transition-all duration-200"
        onClick={onClick}
    >
        {collapsed ? (
            <img
                src="/Ohnix_Icon.svg"
                alt="Ohnix icon"
                className="h-10 w-auto transition-transform duration-200 group-hover:scale-105 drop-shadow-lg"
            />
        ) : (
            <img
                src="/Logo-lite.svg"
                alt="Ohnix logo"
                className="h-20 w-auto transition-transform duration-200 group-hover:scale-105 drop-shadow-lg"
            />
        )}
    </div>
);

const SidebarUserProfile = ({ user, logout, t }) => {
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
    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[var(--ohnix-bg)]/70 to-transparent">
        <div className="bg-[var(--ohnix-hover-overlay)] backdrop-blur-sm rounded-xl p-3 border border-[var(--ohnix-line-5)] shadow-xl">
            <div className="flex items-center gap-3 mb-3">
                <Avatar
                    src={getAvatarSrc()}
                    style={{
                        background:
                            "linear-gradient(135deg, #29d8d5 0%, #44f3f0 100%)",
                        border: "2px solid var(--ohnix-line-7)",
                        boxShadow: "0 6px 14px rgba(41, 216, 213, 0.3)",
                    }}
                    icon={<UserOutlined />}
                    size={40}
                />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--ohnix-text-primary)] truncate m-0">
                        {user?.username || "User"}
                    </p>
                    <p className="text-xs text-[var(--ohnix-text-muted)] truncate m-0">
                        {user?.role || "Administrator"}
                    </p>
                </div>
            </div>
            <button
                onClick={logout}
                className="w-full bg-[var(--ohnix-hover-overlay)] hover:bg-[var(--ohnix-hover-overlay-strong)] text-[var(--ohnix-text-primary)] font-medium py-2 px-3 rounded-lg text-sm transition-all duration-150 flex items-center justify-center gap-2 border border-[var(--ohnix-line-5)] hover:border-[#29D8D5]/40 backdrop-blur-sm"
            >
                <LogoutOutlined className="text-base" />
                <span>{t("common.logout")}</span>
            </button>
        </div>
    </div>
    );
};

export default DashboardSidebar;
