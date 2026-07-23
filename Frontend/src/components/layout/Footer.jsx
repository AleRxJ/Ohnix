import React from "react";
import { Layout, Row, Col, Space, Divider } from "antd";
import {
    GithubOutlined,
    TwitterOutlined,
    LinkedinFilled,
    InstagramFilled,
    MailOutlined,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

const { Footer: AntFooter } = Layout;

const Footer = () => {
    const { t } = useI18n();

    return (
        <AntFooter className="border-t border-white/5 bg-[#050505] pt-16 pb-8 text-[#A9B3B8]">
            <div className="container mx-auto max-w-7xl px-6">
                <Row gutter={[64, 32]} justify="space-between" align="middle">
                    <Col xs={24} md={12} lg={14}>
                        <div>
                            <img
                                src="/FullLogo_Transparent_NoBuffer.png"
                                alt="iTcycle"
                                className="mb-4 h-10 w-auto"
                            />
                            <p className="max-w-md text-sm leading-relaxed text-[#A9B3B8]">
                                {t("landing.footer.tagline")}
                            </p>
                            <Space size="large" className="mt-8 text-3xl">
                                <a
                                    href="https://github.com/iTCycle/Ohnix"
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="GitHub"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 transition-colors duration-200 hover:border-[#29D8D5]/35 hover:bg-white/[0.04]"
                                >
                                    <GithubOutlined className="text-[#A9B3B8] transition-colors duration-200 hover:text-white" />
                                </a>
                                <a
                                    href="https://github.com/iTCycle/Ohnix"
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Twitter"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 transition-colors duration-200 hover:border-[#29D8D5]/35 hover:bg-white/[0.04]"
                                >
                                    <TwitterOutlined className="text-[#A9B3B8] transition-colors duration-200 hover:text-white" />
                                </a>
                                <a
                                    href="https://github.com/iTCycle/Ohnix"
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="Instagram"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 transition-colors duration-200 hover:border-[#29D8D5]/35 hover:bg-white/[0.04]"
                                >
                                    <InstagramFilled className="text-[#A9B3B8] transition-colors duration-200 hover:text-white" />
                                </a>
                                <a
                                    href="https://github.com/iTCycle/Ohnix"
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label="LinkedIn"
                                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/8 transition-colors duration-200 hover:border-[#29D8D5]/35 hover:bg-white/[0.04]"
                                >
                                    <LinkedinFilled className="text-[#A9B3B8] transition-colors duration-200 hover:text-white" />
                                </a>
                            </Space>
                        </div>
                    </Col>

                    <Col xs={24} md={12} lg={8}>
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
                    </Col>
                </Row>

                <Divider className="my-10 border-white/8 opacity-40" />

                <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                    <p className="text-sm text-[#6F7A81]">
                        © {new Date().getFullYear()} iTcycle. {t("landing.footer.copyright")}
                    </p>
                    <div className="flex gap-8 text-sm">
                        <a href="#home" className="text-[#6F7A81] transition-colors duration-200 hover:text-white">
                            {t("landing.nav.home")}
                        </a>
                        <a href="#features" className="text-[#6F7A81] transition-colors duration-200 hover:text-white">
                            {t("landing.nav.features")}
                        </a>
                        <a href="#contact" className="text-[#6F7A81] transition-colors duration-200 hover:text-white">
                            {t("landing.nav.contact")}
                        </a>
                    </div>
                </div>
            </div>
        </AntFooter>
    );
};

export default Footer;
