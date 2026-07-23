import { Layout } from "antd";
import { ArrowRightOutlined } from "@ant-design/icons";
import { useNavigate } from "react-router-dom";
import Navbar from "../components/layout/Navbar";
import Footer from "../components/layout/Footer";
import { ContentSection, SectionHeading } from "../components/landing/LandingPageSections";
import useI18n from "../hooks/useI18n";

const { Content } = Layout;

const Demo = () => {
    const navigate = useNavigate();
    const { t } = useI18n();

    return (
        <Layout className="min-h-screen bg-[#050505]">
            <Navbar />
            <Content className="bg-[#050505] pt-20">
                <ContentSection id="demo" shell={false}>
                    <SectionHeading
                        align="left"
                        eyebrow={t("landing.demo.eyebrow")}
                        title={t("landing.demo.title")}
                        description={t("landing.demo.description")}
                    />

                    <div className="mt-10 overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.45)]">
                        <div className="aspect-video overflow-hidden rounded-[22px] border border-white/8 bg-[#0a0a0a]">
                            <iframe
                                title={t("landing.demo.video_title")}
                                className="h-full w-full"
                                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                                allowFullScreen
                            />
                        </div>
                    </div>

                    <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                        <button
                            type="button"
                            onClick={() => navigate("/signup")}
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
            </Content>
            <Footer />
        </Layout>
    );
};

export default Demo;
