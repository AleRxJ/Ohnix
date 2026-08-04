// components/layout/MobileMenu.jsx
import React, { useEffect, useRef } from "react";
import { Menu } from "antd";
import { getMenuItems } from "../../data";
import useI18n from "../../hooks/useI18n";
import AuthContext from "../../context/AuthContext";

const MobileMenu = ({ collapsed, currentPage, onClose }) => {
    const { user } = React.useContext(AuthContext);
    const { t } = useI18n();
    const panelRef = useRef(null);

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

    return (
        <div
            className="md:hidden fixed inset-0 transition-all duration-300 ease-in-out"
            style={{
                opacity: !collapsed ? 1 : 0,
                pointerEvents: !collapsed ? "auto" : "none",
                zIndex: 999,
            }}
        >
            <div
                className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
                onClick={onClose}
            />
            <div
                ref={panelRef}
                className="absolute top-16 left-0 right-0 max-h-[calc(100vh-4rem)] overflow-hidden border-b border-white/10 bg-[linear-gradient(180deg,rgba(9,10,12,0.98),rgba(5,5,5,0.98))] shadow-2xl"
            >
                <div className="px-4 py-3 h-full flex flex-col gap-3">
                    <div className="flex-1 rounded-2xl overflow-hidden border border-white/10 bg-white/[0.03] shadow-inner">
                        <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-[#29D8D5]/70 scrollbar-track-white/10 hover:scrollbar-thumb-[#44F3F0]">
                            <Menu
                                theme="dark"
                                selectedKeys={[currentPage]}
                                mode="inline"
                                items={getMenuItems(t, user?.role, user?.company?.countryCode === "CO")}
                                onClick={onClose}
                                className="border-r-0"
                                style={{
                                    background: "transparent",
                                    padding: "0.5rem",
                                }}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MobileMenu;
