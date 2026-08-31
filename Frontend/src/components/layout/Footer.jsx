import React from "react";
import { Link } from "react-router-dom";
import {
    FacebookFilled,
    InstagramFilled,
    MailOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

// Plain HTML/Tailwind instead of antd (Layout/Row/Col/Space/Divider) - see
// Navbar.jsx for why: this is public marketing chrome, and antd's vendor
// chunk was being pulled into every marketing page just for basic layout.
const Footer = () => {
    const { t } = useI18n();

    return (
        <footer className="border-t border-white/5 bg-[#050505] pt-16 pb-8 text-[#A9B3B8]">
            <div className="container mx-auto max-w-7xl px-6">
                <div className="flex flex-col items-start gap-12 md:flex-row md:items-center md:justify-between">
                    <div>
                        <img
                            src="/Ohnix_FullLogo_Optimized.png"
                            alt="Ohnix logo"
                            width="160"
                            height="40"
                            className="mb-4 h-10 w-auto"
                        />
                        <p className="max-w-md text-sm leading-relaxed text-[#A9B3B8]">
                            {t("landing.footer.tagline")}
                        </p>
                        <div className="mt-8 flex items-center gap-4 text-3xl">
                            <a
                                href="https://www.instagram.com/ohnix.co/"
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Instagram"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 transition-colors duration-200 hover:border-[#29D8D5]/35 hover:bg-white/[0.04]"
                            >
                                <InstagramFilled className="text-[#A9B3B8] transition-colors duration-200 hover:text-white" />
                            </a>
                            <a
                                href="https://www.facebook.com/ohnix.co"
                                target="_blank"
                                rel="noreferrer"
                                aria-label="Facebook"
                                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 transition-colors duration-200 hover:border-[#29D8D5]/35 hover:bg-white/[0.04]"
                            >
                                <FacebookFilled className="text-[#A9B3B8] transition-colors duration-200 hover:text-white" />
                            </a>
                        </div>
                    </div>

                    <div className="flex flex-col items-start md:items-end">
                        <h2 className="mb-5 text-xs font-semibold uppercase tracking-[0.35em] text-white">
                            {t("landing.footer.contact_title")}
                        </h2>
                        <a
                            href={`mailto:${t("landing.footer.email")}`}
                            className="group flex items-center gap-2 text-sm text-[#A9B3B8] transition-colors duration-200 hover:text-white"
                        >
                            <MailOutlined className="text-base transition-transform duration-200 group-hover:scale-110" />
                            {t("landing.footer.email")}
                        </a>
                    </div>
                </div>

                <hr className="my-10 border-white/8 opacity-40" />

                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-[#8B969C]">
                        © {new Date().getFullYear()} iTcycle. {t("landing.footer.copyright")}
                    </p>
                    <div className="flex gap-8 text-sm">
                        <Link to="/#home" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.nav.home")}
                        </Link>
                        <Link to="/software-inventario-pymes" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.pymes")}
                        </Link>
                        <Link to="/colaboracion-en-equipo" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.team")}
                        </Link>
                        <Link to="/precios" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.pricing")}
                        </Link>
                        <Link to="/comparativa/ohnix-vs-alegra" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.comparison")}
                        </Link>
                        <Link to="/blog" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.blog")}
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
