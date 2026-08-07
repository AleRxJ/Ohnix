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

const { Sider } = Layout;

const TEAM_CAPABLE_PLANS = ["growth", "scale", "enterprise"];

const DashboardSidebar = ({ collapsed, setCollapsed, currentPage }) => {
    const { user, logout } = useContext(AuthContext);
    const { team, hasPermission, loading: teamLoading } = useTeam();
    const { plan } = useSubscription();
    const { t } = useI18n();
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
            theme="dark"
            width={260}
            className="hidden md:block"
            style={{
                overflowY: "auto",
                height: "100vh",
                position: "sticky",
                top: 0,
                left: 0,
                zIndex: 1000,
                background: "linear-gradient(180deg, #0b0b0b 0%, #0a1114 100%)",
                borderRight: "1px solid rgba(255,255,255,0.1)",
            }}
        >
            <SidebarLogo collapsed={collapsed} onClick={handleLogoClick} />
            <div className="mx-4 mb-4 h-px bg-white/10"></div>

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
                        theme="dark"
                        defaultSelectedKeys={[currentPage]}
                        mode="inline"
                        items={getMenuItems(t, user?.role, user?.company?.countryCode === "CO", showTeam, hasPermission).map((item) => ({
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
                src="/Ohnix_FullLogo.svg"
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
    <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/70 to-transparent">
        <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/12 shadow-xl">
            <div className="flex items-center gap-3 mb-3">
                <Avatar
                    src={getAvatarSrc()}
                    style={{
                        background:
                            "linear-gradient(135deg, #29d8d5 0%, #44f3f0 100%)",
                        border: "2px solid rgba(255, 255, 255, 0.3)",
                        boxShadow: "0 6px 14px rgba(41, 216, 213, 0.3)",
                    }}
                    icon={<UserOutlined />}
                    size={40}
                />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate m-0">
                        {user?.username || "User"}
                    </p>
                    <p className="text-xs text-[#A9B3B8] truncate m-0">
                        {user?.role || "Administrator"}
                    </p>
                </div>
            </div>
            <button
                onClick={logout}
                className="w-full bg-white/6 hover:bg-white/12 text-white font-medium py-2 px-3 rounded-lg text-sm transition-all duration-150 flex items-center justify-center gap-2 border border-white/12 hover:border-[#29D8D5]/40 backdrop-blur-sm"
            >
                <LogoutOutlined className="text-base" />
                <span>{t("common.logout")}</span>
            </button>
        </div>
    </div>
    );
};

export default DashboardSidebar;
