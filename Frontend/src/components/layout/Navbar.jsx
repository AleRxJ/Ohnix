import { useState, useEffect } from "react";
import { Layout, Button, Drawer, Dropdown } from "antd";
import { MenuOutlined, GlobalOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import useI18n from "../../hooks/useI18n";

const { Header } = Layout;

const Navbar = () => {
    const [visible, setVisible] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const navigate = useNavigate();
    const { t, currentLanguage, changeLanguage } = useI18n();

    const navLinks = [
        { label: t("landing.nav.home"), path: "home" },
        { label: t("landing.nav.features"), path: "features" },
        { label: t("landing.nav.process"), path: "timeline" },
        { label: t("landing.nav.faq"), path: "faq" },
        { label: t("landing.nav.contact"), path: "contact" },
    ];

    const scrollToSection = (id) => {
        const anchor = document.getElementById(id);
        if (anchor) {
            anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    useEffect(() => {
        const handleScroll = () => {
            if (window.scrollY > 20) {
                setScrolled(true);
            } else {
                setScrolled(false);
            }
        };

        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    const showDrawer = () => {
        setVisible(true);
    };

    const closeDrawer = () => {
        setVisible(false);
    };

    const handleNavigation = (path) => {
        navigate(path);
        closeDrawer();
    };

    return (
        <Header
            className={`px-0 flex items-center justify-between h-20 fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
                scrolled
                    ? "bg-[#050505]/90 backdrop-blur-xl border-b border-white/8"
                    : "bg-transparent"
            }`}
            style={{ borderBottom: "none" }}
        >
            <div className="container mx-auto flex items-center justify-between px-6">
                <button
                    type="button"
                    onClick={() => handleNavigation("/")}
                    className="flex items-center gap-3 text-left"
                >
                    <img
                        src="/FullLogo_Transparent_NoBuffer.png"
                        alt="iTcycle"
                        className="h-10 w-auto md:h-11"
                    />
                </button>

                <div className="hidden md:flex items-center gap-8">
                    <nav>
                        <ul className="flex items-center gap-8">
                            {navLinks.map((link) => (
                                <li key={link.path}>
                                    <a
                                        href="#"
                                        onClick={(e) => {
                                            e.preventDefault();
                                            scrollToSection(link.path);
                                        }}
                                        className={`text-sm font-medium transition-all duration-200 relative group ${
                                            scrolled
                                                ? "text-[#A9B3B8] hover:text-white"
                                                : "text-white/80 hover:text-white"
                                        }`}
                                    >
                                        {link.label}
                                        <span
                                            className={`absolute left-0 -bottom-1 w-0 h-0.5 transition-all duration-200 group-hover:w-full ${
                                                scrolled ? "bg-[#29D8D5]" : "bg-[#44F3F0]"
                                            }`}
                                        ></span>
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </nav>
                    <div className="flex items-center gap-3">
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
                            <Button
                                className={`h-10 px-3 text-sm font-medium border rounded-full transition-all duration-200 ${
                                    scrolled
                                        ? "border-white/12 text-white hover:border-[#29D8D5]/35 bg-white/[0.03]"
                                        : "border-white/16 text-white hover:border-[#29D8D5]/35 bg-white/[0.02]"
                                }`}
                                icon={<GlobalOutlined />}
                            >
                                {currentLanguage === "es" ? "ES" : "EN"}
                            </Button>
                        </Dropdown>
                        <Button
                            onClick={() => handleNavigation("/login")}
                            className={`h-10 px-5 text-sm font-medium border rounded-full transition-all duration-200 ${
                                scrolled
                                    ? "border-white/12 text-white hover:border-[#29D8D5]/35 hover:text-white bg-white/[0.03]"
                                    : "border-white/16 text-white hover:border-[#29D8D5]/35 hover:bg-white/[0.08] bg-white/[0.02]"
                            }`}
                        >
                            {t("auth.login")}
                        </Button>
                        <Button
                            onClick={() => handleNavigation("/signup")}
                            className={`h-10 px-5 text-sm font-medium rounded-full border-0 transition-all duration-200 shadow-sm hover:shadow ${
                                scrolled
                                    ? "bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0]"
                                    : "bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0]"
                            }`}
                        >
                            {t("auth.signup")}
                        </Button>
                    </div>
                </div>

                <div className="md:hidden">
                    <Button
                        type="text"
                        icon={
                            <MenuOutlined
                                className={`text-xl ${
                                    scrolled ? "text-white" : "text-white"
                                }`}
                            />
                        }
                        onClick={showDrawer}
                        className="border-0 shadow-none hover:bg-transparent"
                    />
                </div>
            </div>

            <Drawer
                title={
                    <img
                        src="/FullLogo_Transparent_NoBuffer.png"
                        alt="iTcycle"
                        className="h-9 w-auto"
                    />
                }
                placement="right"
                onClose={closeDrawer}
                open={visible}
                width={280}
                styles={{
                    header: {
                        borderBottom: "1px solid rgba(255,255,255,0.08)",
                        padding: "20px 24px",
                        background: "#050505",
                    },
                    body: {
                        padding: "24px",
                        background: "#050505",
                        color: "#fff",
                    },
                }}
            >
                <div className="flex flex-col h-full">
                    <nav className="flex-1">
                        {navLinks.map((link) => (
                            <div key={link.path} className="mb-1">
                                <a
                                    href="#"
                                    onClick={(e) => {
                                        e.preventDefault();
                                        scrollToSection(link.path);
                                        setTimeout(() => closeDrawer(), 100);
                                    }}
                                    className="block rounded-2xl px-4 py-3 text-sm font-medium text-[#A9B3B8] transition-all duration-200 hover:bg-white/[0.05] hover:text-white"
                                >
                                    {link.label}
                                </a>
                            </div>
                        ))}
                    </nav>
                    <div className="flex flex-col gap-3 pt-6 border-t border-white/8">
                        <Button
                            block
                            onClick={() => handleNavigation("/login")}
                            className="h-10 rounded-full border border-white/10 bg-white/[0.03] text-sm font-medium text-white hover:border-[#29D8D5]/35 hover:text-white"
                        >
                            {t("auth.login")}
                        </Button>
                        <Button
                            block
                            onClick={() => handleNavigation("/signup")}
                            className="h-10 rounded-full border-0 bg-[#29D8D5] text-sm font-medium text-[#021314] shadow-sm hover:bg-[#44F3F0]"
                        >
                            {t("auth.signup")}
                        </Button>
                    </div>
                </div>
            </Drawer>
        </Header>
    );
};

export default Navbar;
