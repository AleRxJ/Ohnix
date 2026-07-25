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
    MenuFoldOutlined,
    MenuUnfoldOutlined,
} from "@ant-design/icons";
import AuthContext from "../../context/AuthContext";
import useI18n from "../../hooks/useI18n";
import LanguageSwitcher from "../LanguageSwitcher/LanguageSwitcher";

const DashboardHeader = ({ collapsed, setCollapsed }) => {
    const { user, logout } = useContext(AuthContext);
    const { t, currentLanguage, changeLanguage } = useI18n();
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

    // Avatar dropdown menu
    const avatarMenu = [
        {
            key: "profile",
            label: <Link to="/profile">{t("common.profile")}</Link>,
            icon: <UserOutlined />,
        },
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
            className="px-6 flex items-center justify-between z-10 sticky top-0 h-16"
            style={{
                background:
                    "linear-gradient(180deg, rgba(9,10,12,0.95) 0%, rgba(9,10,12,0.86) 100%)",
                borderBottom: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 8px 28px rgba(0,0,0,0.35)",
                backdropFilter: "blur(8px)",
            }}
        >
            <div className="flex items-center gap-4">
                {/* Logo for mobile */}
                <div
                    className="cursor-pointer md:hidden"
                    onClick={handleLogoClick}
                >
                    <div className="flex items-center">
                        <img
                            src="/Ohnix_Icon.svg"
                            alt="Ohnix icon"
                            className="h-full w-auto p-2"
                            style={{ maxHeight: "48px" }}
                        />
                    </div>
                </div>
                <div className="md:hidden">
                    <button
                        className="text-lg px-2 py-1 rounded-md bg-white/10 text-white hover:bg-white/15 transition-colors border border-white/12"
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
                        className="text-lg px-2 py-1 rounded-md bg-white/10 text-white hover:bg-white/15 transition-colors border border-white/12"
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
                                    changeLanguage(e.key);
                                }
                            },
                        }}
                    >
                        <button className="h-9 min-w-9 rounded-full border border-gray-200 bg-white px-2 text-xs font-semibold text-gray-700 hover:border-cyan-400 transition-colors">
                            {currentLanguage === "es" ? "ES" : "EN"}
                        </button>
                    </Dropdown>
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
    <div className="hidden sm:flex flex-col items-end mr-3">
        <span className="text-sm font-bold text-white">
            {user?.username || "User"}
        </span>
        <span className="text-xs text-[#A9B3B8]">
            {user?.role || "Administrator"}
        </span>
    </div>
);

const UserAvatar = ({ user, avatarMenu }) => (
    <Dropdown menu={{ items: avatarMenu }} placement="bottomRight" arrow>
        <div className="cursor-pointer">
            <Avatar
                src={user?.avatar}
                style={{
                    background: "linear-gradient(135deg, #29d8d5 0%, #44f3f0 100%)",
                    border: "2px solid rgba(255,255,255,0.26)",
                    boxShadow: "0 8px 20px rgba(41,216,213,0.25)",
                }}
                icon={<UserOutlined />}
                size="large"
            />
        </div>
    </Dropdown>
);

export default DashboardHeader;
