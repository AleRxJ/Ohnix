import { useState, useEffect, useRef } from "react";
import { MenuOutlined, GlobalOutlined, CloseOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";
import useI18n from "../../hooks/useI18n";
import useScrollLock from "../../hooks/useScrollLock";

// Plain HTML/Tailwind instead of antd (Layout/Button/Drawer/Dropdown) - this
// is public-facing marketing chrome, rendered on every marketing page, and
// pulling in antd here forced those pages to load the same multi-MB vendor
// chunk the authenticated app needs, hurting their LCP. Behavior (drawer
// slide-in, backdrop dismiss, outside-click-to-close dropdown, Escape to
// close) is reproduced manually below since there's no library doing it now.
const Navbar = () => {
    const [visible, setVisible] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [langMenuOpen, setLangMenuOpen] = useState(false);
    const langMenuRef = useRef(null);
    const navigate = useNavigate();
    const location = useLocation();
    const { t, currentLanguage, changeLanguage } = useI18n();

    const navLinks = [
        { label: t("landing.nav.home"), path: "home" },
        { label: t("landing.nav.features"), path: "features" },
        { label: t("landing.nav.process"), path: "timeline" },
        { label: t("pricing.eyebrow", { defaultValue: "Pricing" }), path: "pricing" },
        { label: t("landing.nav.faq"), path: "faq" },
        { label: t("landing.nav.contact"), path: "contact" },
    ];

    const scrollToSection = (id) => {
        const anchor = document.getElementById(id);
        if (anchor) {
            anchor.scrollIntoView({ behavior: "smooth", block: "start" });
        }
    };

    // Used from the mobile drawer's nav links: closing the drawer unlocks
    // body scroll (useScrollLock's cleanup restores the pre-open scroll
    // position), which would otherwise race with / cancel a scrollIntoView
    // fired at the same time. Close first, then wait a couple of paints so
    // the unlock effect has actually run before scrolling to the target.
    const navigateToSectionFromDrawer = (id) => {
        closeDrawer();
        requestAnimationFrame(() => requestAnimationFrame(() => scrollToSection(id)));
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

    // Close the language dropdown on outside click or Escape.
    useEffect(() => {
        if (!langMenuOpen) return;
        const handleClickOutside = (e) => {
            if (langMenuRef.current && !langMenuRef.current.contains(e.target)) {
                setLangMenuOpen(false);
            }
        };
        const handleEscape = (e) => {
            if (e.key === "Escape") setLangMenuOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        document.addEventListener("keydown", handleEscape);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            document.removeEventListener("keydown", handleEscape);
        };
    }, [langMenuOpen]);

    // Lock body scroll while the mobile drawer is open. Plain
    // overflow:hidden (used here before) doesn't reliably block background
    // scroll on iOS Safari when the user drags directly on the page - see
    // useScrollLock for the position:fixed workaround that actually holds.
    useScrollLock(visible);

    // Allow Escape-to-close while the mobile drawer is open.
    useEffect(() => {
        if (!visible) return;
        const handleEscape = (e) => {
            if (e.key === "Escape") setVisible(false);
        };
        document.addEventListener("keydown", handleEscape);
        return () => document.removeEventListener("keydown", handleEscape);
    }, [visible]);

    const showDrawer = () => setVisible(true);
    const closeDrawer = () => setVisible(false);

    const handleNavigation = (path) => {
        navigate(path);
        closeDrawer();
    };

    const selectLanguage = (lang) => {
        changeLanguage(lang);
        setLangMenuOpen(false);
    };

    return (
        <header
            className={`px-0 flex items-center justify-between h-20 fixed top-0 left-0 w-full z-50 transition-all duration-300 ${
                scrolled
                    ? "bg-[#050505]/90 backdrop-blur-xl border-b border-white/8"
                    : "bg-transparent"
            }`}
        >
            <div className="container mx-auto flex items-center justify-between px-6">
                <button
                    type="button"
                    onClick={() => handleNavigation("/")}
                    className="flex items-center gap-3 text-left"
                >
                    <img
                        src="/Ohnix_Icon_Optimized.png"
                        alt="Ohnix logo"
                        width="44"
                        height="44"
                        className="h-10 w-auto md:h-11"
                    />
                </button>

                <div className="hidden lg:flex items-center gap-5 xl:gap-8">
                    <nav>
                        <ul className="flex items-center gap-5 xl:gap-7">
                            {navLinks.map((link) => (
                                <li key={link.path}>
                                    <a
                                        href={location.pathname === "/" ? `#${link.path}` : `/#${link.path}`}
                                        onClick={(e) => {
                                            if (location.pathname === "/") {
                                                e.preventDefault();
                                                scrollToSection(link.path);
                                            }
                                        }}
                                        className={`whitespace-nowrap text-sm font-medium transition-all duration-200 relative group ${
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
                    <div className="flex items-center gap-2 xl:gap-3">
                        <div className="relative" ref={langMenuRef}>
                            <button
                                type="button"
                                onClick={() => setLangMenuOpen((prev) => !prev)}
                                aria-haspopup="listbox"
                                aria-expanded={langMenuOpen}
                                className={`h-10 px-3 inline-flex items-center gap-1.5 text-sm font-medium border rounded-full transition-all duration-200 ${
                                    scrolled
                                        ? "border-white/12 text-white hover:border-[#29D8D5]/35 bg-white/[0.03]"
                                        : "border-white/16 text-white hover:border-[#29D8D5]/35 bg-white/[0.02]"
                                }`}
                            >
                                <GlobalOutlined />
                                {currentLanguage === "es" ? "ES" : "EN"}
                            </button>
                            {langMenuOpen && (
                                <div
                                    role="listbox"
                                    className="absolute right-0 mt-2 w-36 overflow-hidden rounded-xl border border-white/10 bg-[#0B0B0B] shadow-[0_18px_36px_rgba(0,0,0,0.4)]"
                                >
                                    <button
                                        type="button"
                                        onClick={() => selectLanguage("en")}
                                        className="block w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/[0.06]"
                                    >
                                        English
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => selectLanguage("es")}
                                        className="block w-full px-4 py-2.5 text-left text-sm text-white hover:bg-white/[0.06]"
                                    >
                                        Español
                                    </button>
                                </div>
                            )}
                        </div>
                        <button
                            type="button"
                            onClick={() => handleNavigation("/login")}
                            className={`h-10 px-4 xl:px-5 whitespace-nowrap text-sm font-medium border rounded-full transition-all duration-200 ${
                                scrolled
                                    ? "border-white/12 text-white hover:border-[#29D8D5]/35 hover:text-white bg-white/[0.03]"
                                    : "border-white/16 text-white hover:border-[#29D8D5]/35 hover:bg-white/[0.08] bg-white/[0.02]"
                            }`}
                        >
                            {t("auth.login")}
                        </button>
                        <button
                            type="button"
                            onClick={() => handleNavigation("/signup")}
                            className="h-10 px-4 xl:px-5 whitespace-nowrap text-sm font-medium rounded-full border-0 transition-all duration-200 shadow-sm hover:shadow bg-[#29D8D5] text-[#021314] hover:bg-[#44F3F0]"
                        >
                            {t("auth.signup")}
                        </button>
                    </div>
                </div>

                <div className="md:hidden">
                    <button
                        type="button"
                        onClick={showDrawer}
                        aria-label="Open menu"
                        className="flex h-10 w-10 items-center justify-center border-0 bg-transparent shadow-none"
                    >
                        <MenuOutlined className="text-xl text-white" />
                    </button>
                </div>
            </div>

            {visible && (
                <>
                    <div
                        className="fixed inset-0 z-[60] bg-black/45"
                        onClick={closeDrawer}
                        aria-hidden="true"
                    />
                    <div
                        role="dialog"
                        aria-modal="true"
                        className="fixed right-0 top-0 z-[70] flex h-dvh w-[280px] max-w-[85vw] flex-col overflow-hidden bg-[#050505]"
                        style={{ boxShadow: "-8px 0 24px rgba(0,0,0,0.35)" }}
                    >
                        <div
                            className="flex items-center justify-between px-6 py-5"
                            style={{ borderBottom: "1px solid rgba(255,255,255,0.08)" }}
                        >
                            <img
                                src="/Ohnix_FullLogo_Optimized.png"
                                alt="Ohnix logo"
                                width="144"
                                height="36"
                                className="h-9 w-auto"
                            />
                            <button
                                type="button"
                                onClick={closeDrawer}
                                aria-label="Close menu"
                                className="flex h-8 w-8 items-center justify-center text-white/70 hover:text-white"
                            >
                                <CloseOutlined />
                            </button>
                        </div>
                        <div className="flex flex-1 flex-col p-6 text-white overflow-y-auto ohnix-scrollbar-thin">
                            <nav className="flex-1">
                                {navLinks.map((link) => (
                                    <div key={link.path} className="mb-1">
                                        <a
                                            href={location.pathname === "/" ? `#${link.path}` : `/#${link.path}`}
                                            onClick={(e) => {
                                                if (location.pathname === "/") {
                                                    e.preventDefault();
                                                    navigateToSectionFromDrawer(link.path);
                                                } else {
                                                    closeDrawer();
                                                }
                                            }}
                                            className="block rounded-2xl px-4 py-3 text-sm font-medium text-[#A9B3B8] transition-all duration-200 hover:bg-white/[0.05] hover:text-white"
                                        >
                                            {link.label}
                                        </a>
                                    </div>
                                ))}
                            </nav>
                            <div className="pb-4">
                                <div className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-[#A9B3B8]">
                                    {t("common.language")}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        type="button"
                                        onClick={() => changeLanguage("es")}
                                        className={`h-10 rounded-full border text-sm font-medium transition-all duration-200 ${
                                            currentLanguage === "es"
                                                ? "border-[#29D8D5] bg-[#29D8D5] text-[#021314]"
                                                : "border-white/10 bg-white/[0.03] text-white hover:border-[#29D8D5]/35"
                                        }`}
                                    >
                                        ES
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => changeLanguage("en")}
                                        className={`h-10 rounded-full border text-sm font-medium transition-all duration-200 ${
                                            currentLanguage === "en"
                                                ? "border-[#29D8D5] bg-[#29D8D5] text-[#021314]"
                                                : "border-white/10 bg-white/[0.03] text-white hover:border-[#29D8D5]/35"
                                        }`}
                                    >
                                        EN
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-col gap-3 pt-6 border-t border-white/8">
                                <button
                                    type="button"
                                    onClick={() => handleNavigation("/login")}
                                    className="h-10 rounded-full border border-white/10 bg-white/[0.03] text-sm font-medium text-white hover:border-[#29D8D5]/35 hover:text-white"
                                >
                                    {t("auth.login")}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleNavigation("/signup")}
                                    className="h-10 rounded-full border-0 bg-[#29D8D5] text-sm font-medium text-[#021314] shadow-sm hover:bg-[#44F3F0]"
                                >
                                    {t("auth.signup")}
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </header>
    );
};

export default Navbar;
