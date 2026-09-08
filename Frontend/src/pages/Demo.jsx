import { useRef, useState } from "react";
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
    const videoRef = useRef(null);
    const [playing, setPlaying] = useState(false);

    const breadcrumbStructuredData = {
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

    const videoStructuredData = {
        "@context": "https://schema.org",
        "@type": "VideoObject",
        name: "Demo de Ohnix | Inventario, compras y ventas en accion",
        description:
            "Conoce como Ohnix organiza inventario, compras, pedidos y reportes en una sola experiencia operativa para pymes.",
        thumbnailUrl: ["https://ohnix.co/ohnix-social-preview-v2.png"],
        uploadDate: "2026-09-01T00:00:00-05:00",
        contentUrl: "https://ohnix.co/demo-preview.mp4",
        embedUrl: "https://ohnix.co/demo",
    };

    const structuredData = [breadcrumbStructuredData, videoStructuredData];

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
                        <div className="relative aspect-video overflow-hidden rounded-[22px] border border-white/8 bg-[#0a0a0a]">
                            <video
                                ref={videoRef}
                                src="/demo-preview.mp4"
                                poster="/ohnix-social-preview-v2.png"
                                controls={playing}
                                preload="metadata"
                                playsInline
                                onPlay={() => setPlaying(true)}
                                onPause={() => setPlaying(false)}
                                onEnded={() => setPlaying(false)}
                                className="h-full w-full object-cover"
                            />
                            {!playing && (
                                <button
                                    type="button"
                                    onClick={() => videoRef.current?.play()}
                                    aria-label={t("landing.demo.primary_cta")}
                                    className="group absolute inset-0 flex flex-col items-center justify-center gap-6 bg-black/45 text-center transition-colors duration-300 hover:bg-black/35"
                                >
                                    <span className="relative flex h-24 w-24 items-center justify-center">
                                        <span className="absolute h-full w-full rounded-full bg-[#29D8D5]/20 animate-ripple" />
                                        <span className="absolute h-full w-full rounded-full bg-[#29D8D5]/15 animate-ripple-delay" />
                                        <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-[#29D8D5]/40 bg-[#29D8D5]/10 text-[#29D8D5] transition-transform duration-300 group-hover:scale-105">
                                            <PlayCircleOutlined className="text-4xl" />
                                        </span>
                                    </span>
                                    <p className="text-lg font-semibold text-white">{t("landing.demo.title")}</p>
                                </button>
                            )}
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
