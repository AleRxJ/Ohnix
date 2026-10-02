import React from "react";
import { Link } from "react-router-dom";
import {
    FacebookFilled,
    InstagramFilled,
    MailOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { ELECTRONIC_INVOICING_ENABLED } from "../../config/features";

// Plain HTML/Tailwind instead of antd (Layout/Row/Col/Space/Divider) - see
// Navbar.jsx for why: this is public marketing chrome, and antd's vendor
// chunk was being pulled into every marketing page just for basic layout.
// `clearMobileBars`: the landing stacks two fixed bars at the bottom on
// phones and small tablets (support bar ~64px on top of the sticky signup
// CTA ~73px, both below md). Without enough bottom padding the last footer links sit
// under them at max scroll and can't be tapped. Other pages have no fixed
// bottom bars, so they only need the safe-area inset.
const Footer = ({ clearMobileBars = false }) => {
    const { t } = useI18n();
    const bottomPadding = clearMobileBars
        ? "pb-[calc(9.5rem+env(safe-area-inset-bottom,0px))] md:pb-8"
        : "pb-[calc(2rem+env(safe-area-inset-bottom,0px))]";

    return (
        <footer className={`border-t border-white/5 bg-[#050505] pt-16 text-[#A9B3B8] ${bottomPadding}`}>
            <div className="container mx-auto max-w-[1440px] px-6">
                <div className="flex flex-col items-start gap-12 md:flex-row md:items-center md:justify-between">
                    <div>
                        <img
                            src="/Ohnix_FullLogo_Transparent.png"
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
                    <div className="flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm md:justify-end md:gap-8">
                        <Link to="/#home" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.nav.home")}
                        </Link>
                        <Link to="/software-inventario-pymes" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.pymes")}
                        </Link>
                        <Link to="/colaboracion-en-equipo" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.team")}
                        </Link>
                        <Link to="/restaurantes" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.restaurants")}
                        </Link>
                        <Link to="/precios" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.pricing")}
                        </Link>
                        <Link to="/comparativa/ohnix-vs-alegra" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.comparison")}
                        </Link>
                        {ELECTRONIC_INVOICING_ENABLED && (
                            <Link to="/facturacion-electronica-sin-inventario" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                                {t("landing.footer.links.standalone_invoicing")}
                            </Link>
                        )}
                        {ELECTRONIC_INVOICING_ENABLED && (
                            <Link to="/certificado-digital-dian" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                                {t("landing.footer.links.certificates")}
                            </Link>
                        )}
                        <Link to="/integraciones" className="text-[#8B969C] transition-colors duration-200 hover:text-white">
                            {t("landing.footer.links.integrations")}
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
