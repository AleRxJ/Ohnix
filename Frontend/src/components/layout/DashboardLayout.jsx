// components/layout/DashboardLayout.jsx
import React, { useState, useEffect } from "react";
import { Layout } from "antd";
import { Outlet, useLocation } from "react-router-dom";
import DashboardHeader from "./DashboardHeader";
import DashboardSidebar from "./DashboardSidebar";
import MobileMenu from "./MobileMenu";

const { Content } = Layout;

const DashboardLayout = () => {
    const [collapsed, setCollapsed] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const location = useLocation();

    useEffect(() => {
        const checkScreenSize = () => {
            setIsMobile(window.innerWidth < 768);
            if (window.innerWidth < 768) {
                setCollapsed(true);
            }
        };

        checkScreenSize();
        window.addEventListener("resize", checkScreenSize);

        return () => {
            window.removeEventListener("resize", checkScreenSize);
        };
    }, []);

    const currentPath = location.pathname;
    const pathSegments = currentPath.split("/").filter(Boolean);
    const currentPage = pathSegments.length > 0 ? pathSegments[0] : "dashboard";

    return (
        <Layout className="dashboard-app min-h-screen relative overflow-hidden">
            <div className="pointer-events-none absolute inset-0 opacity-70 section-glow" />
            <DashboardSidebar
                collapsed={collapsed}
                setCollapsed={setCollapsed}
                currentPage={currentPage}
            />

            <Layout className="bg-transparent relative z-10">
                <DashboardHeader
                    collapsed={collapsed}
                    setCollapsed={setCollapsed}
                />

                <MobileMenu
                    collapsed={collapsed}
                    currentPage={currentPage}
                    onClose={() => setCollapsed(true)}
                />

                <Content className="mx-3 my-3 sm:mx-5 sm:my-5 lg:mx-7 lg:my-7">
                    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(11,11,11,0.9),rgba(8,8,8,0.96))] min-h-[calc(100vh-8rem)] shadow-[0_20px_45px_rgba(0,0,0,0.42)] transition-shadow duration-300 hover:shadow-[0_24px_54px_rgba(0,0,0,0.5)] reveal-card">
                        <Outlet />
                    </div>
                </Content>
            </Layout>
        </Layout>
    );
};

export default DashboardLayout;