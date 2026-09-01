import { ArrowRightOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import SeoHead from "../components/common/SeoHead";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";
import useI18n from "../hooks/useI18n";

const Demo = () => {
    const navigate = useNavigate();
    const { t, currentLanguage } = useI18n();

    const structuredData = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            {
                "@type": "ListItem",
                position: 1,
                name: "Inicio",
                item: "https://ohnix.co/",
            },
            {
                "@type": "ListItem",
                position: 2,
                name: "Demo",
                item: "https://ohnix.co/demo",
            },
        ],
    };

    return (
        <div className="min-h-screen bg-[#050505]">
            <SeoHead
                title="Demo de Ohnix | Inventario, compras y ventas en accion"
                description="Conoce como Ohnix organiza inventario, compras, pedidos y reportes en una sola experiencia operativa para pymes."
                canonicalPath="/demo"
                lang={currentLanguage || "es"}
                structuredData={structuredData}
            />
            <Navbar />
            <main className="bg-[#050505] pt-24">
                <ContentSection id="demo" shell={false}>
                    <SectionHeading
                        as="h1"
                        align="left"
                        eyebrow={t("landing.demo.eyebrow")}
                        title={t("landing.demo.title")}
                        description={t("landing.demo.description")}
                    />

                    <div className="mt-10 overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                        <div className="aspect-video overflow-hidden rounded-[22px] border border-white/8 bg-[#0a0a0a]">
                            {/* placeholder while there's no real product video — same pattern as VideoModal */}
                            <div className="flex h-full w-full flex-col items-center justify-center gap-6 px-6 text-center">
                                <div className="relative flex h-24 w-24 items-center justify-center">
                                    <span className="absolute h-full w-full rounded-full bg-[#29D8D5]/20 animate-ripple" />
                                    <span className="absolute h-full w-full rounded-full bg-[#29D8D5]/15 animate-ripple-delay" />
                                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#29D8D5]">
                                        <PlayCircleOutlined className="text-4xl" />
                                    </div>
                                </div>
                                <div>
                                    <p className="text-lg font-semibold text-white">{t("landing.video_modal.coming_soon_title")}</p>
                                    <p className="mt-2 text-sm text-[#A9B3B8]">{t("landing.video_modal.coming_soon_description")}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => navigate("/signup?plan=growth")}
                            className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#29D8D5] px-6 py-3.5 text-sm font-semibold text-[#021314] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#44F3F0]"
                        >
                            {t("landing.demo.primary_cta")}
                            <ArrowRightOutlined className="transition-transform duration-300 group-hover:translate-x-1" />
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate("/")}
                            className="inline-flex items-center justify-center rounded-full border border-white/12 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:border-[#29D8D5]/40 hover:bg-white/[0.06]"
                        >
                            {t("landing.demo.secondary_cta")}
                        </button>
                    </div>
                </ContentSection>
            </main>
            <Footer />
        </div>
    );
};

export default Demo;
