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
    const { team, hasPermission, isTeamMember, loading: teamLoading } = useTeam();
    const { plan } = useSubscription();
    const { t } = useI18n();
    const { isLite } = useTheme();
    const navigate = useNavigate();
    const showTeam = Boolean(team) || TEAM_CAPABLE_PLANS.includes(plan);
    const showFiscalSetup = ELECTRONIC_INVOICING_ENABLED && (!user?.company || user?.company?.countryCode === "CO") && !isTeamMember;
    const needsFiscalSetup = showFiscalSetup && !user?.company?.electronicInvoicingEnabled;

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
            className="hidden md:block no-print flex flex-col overflow-hidden [&_.ant-layout-sider-children]:flex [&_.ant-layout-sider-children]:min-h-0 [&_.ant-layout-sider-children]:flex-col"
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
            <SidebarLogo collapsed={collapsed} isLite={isLite} onClick={handleLogoClick} />
            <div className="mx-4 mb-4 h-px bg-[var(--ohnix-line-4)]"></div>

            <div className="ohnix-scrollbar-thin min-h-0 flex-1 touch-pan-y overscroll-contain overflow-y-auto px-3">
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
                            // Documentos electrónicos tracks DIAN invoices/credit
                            // notes actually issued - showing it as soon as the
                            // company is merely Colombian (regardless of whether
                            // fiscal-setup was ever completed) sent brand-new
                            // companies to a confusing always-empty page. Gate on
                            // electronicInvoicingEnabled instead, same milestone
                            // ElectronicInvoicingSettings.jsx treats as "actually
                            // organized" (see fiscal_setup.status_active there).
                            ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && Boolean(user?.company?.electronicInvoicingEnabled),
                            showTeam,
                            hasPermission,
                            ELECTRONIC_INVOICING_ENABLED && user?.company?.countryCode === "CO" && user?.company?.electronicInvoicingProvider === "itcycle",
                            showFiscalSetup,
                            needsFiscalSetup
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

            {!collapsed && <SidebarUserProfile user={user} isTeamMember={isTeamMember} logout={handleLogout} t={t} />}
        </Sider>
    );
};

// Ohnix_Icon_Transparent.png's pale strokes are tuned for a dark surface -
// a CSS filter (contrast/brightness) can't darken them cleanly on Lite
// without roughing up the anti-aliased edges at this display size. Lite
// instead gets its own pre-recolored asset (same artwork, strokes and
// wordmark inverted to dark, brand cyan accent kept) rendered at 480px so
// it stays crisp when scaled down, no runtime filter involved.
const SidebarLogo = ({ collapsed, isLite, onClick }) => (
    <div
        className={`flex items-center justify-center py-6 cursor-pointer group transition-all duration-200 ${collapsed ? "px-0" : "px-4"}`}
        onClick={onClick}
    >
        <div
            className={`flex items-center justify-center rounded-2xl transition-transform duration-200 ${collapsed ? "p-2" : "p-3"}`}
        >
            {collapsed ? (
                <img
                    src={isLite ? "/Ohnix_Icon_Lite.png" : "/Ohnix_Icon_Transparent.png"}
                    alt="Ohnix icon"
                    className="h-12 w-12 shrink-0 object-contain transition-transform duration-200 group-hover:scale-110 drop-shadow-lg"
                />
            ) : (
                <img
                    src={isLite ? "/Ohnix_Icon_Lite.png" : "/Ohnix_Icon_Transparent.png"}
                    alt="Ohnix logo"
                    className="h-24 w-24 object-contain transition-transform duration-200 group-hover:scale-105 drop-shadow-lg"
                />
            )}
        </div>
    </div>
);

const SidebarUserProfile = ({ user, isTeamMember, logout, t }) => {
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
    <div className="shrink-0 border-t border-[var(--ohnix-line-4)] bg-[var(--ohnix-bg)]/55 p-3">
        <div className="sidebar-profile-card relative overflow-hidden rounded-xl border border-[var(--ohnix-line-5)] bg-[var(--ohnix-surface-2)]/90 p-3 shadow-[var(--ohnix-shadow-card)]">
            <div className="mb-3 flex items-center gap-3">
                <Avatar
                    src={getAvatarSrc()}
                    style={{
                        background:
                            "linear-gradient(135deg, #29d8d5 0%, #44f3f0 100%)",
                        border: "2px solid var(--ohnix-line-7)",
                        boxShadow: "0 6px 14px rgba(41, 216, 213, 0.3)",
                    }}
                    icon={<UserOutlined />}
                    size={42}
                />
                <div className="flex-1 min-w-0">
                    <p className="m-0 truncate text-sm font-semibold text-[var(--ohnix-text-primary)]">
                        {user?.username || "User"}
                    </p>
                    <p className="m-0 mt-0.5 truncate text-xs text-[var(--ohnix-text-muted)]">
                        {isTeamMember
                            ? t("profile.invited_user_account")
                            : t("profile.inventory_admin_account")}
                    </p>
                </div>
            </div>
            <button
                type="button"
                onClick={logout}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-transparent bg-[var(--ohnix-hover-overlay)] px-3 py-2 text-sm font-medium text-[var(--ohnix-text-soft)] transition-all duration-150 hover:border-[#29D8D5]/50 hover:bg-[#29D8D5]/10 hover:text-[var(--ohnix-text-primary)] focus:outline-none focus:ring-2 focus:ring-[#29D8D5]/50"
            >
                <LogoutOutlined className="text-base" />
                <span>{t("common.logout")}</span>
            </button>
        </div>
    </div>
    );
};

export default DashboardSidebar;
