import React, { useState } from "react";
import {
    ArrowRightOutlined,
    ApiOutlined,
    ApartmentOutlined,
    CheckCircleOutlined,
    ClockCircleOutlined,
    DatabaseOutlined,
    EnvironmentOutlined,
    GlobalOutlined,
    LinkOutlined,
    PlayCircleOutlined,
    RocketOutlined,
    SafetyOutlined,
    SyncOutlined,
    ThunderboltOutlined,
    TeamOutlined,
    LineChartOutlined,
    MailOutlined,
    QuestionCircleOutlined,
    SmileOutlined,
} from "@ant-design/icons";

const sectionShell =
    "relative overflow-hidden border-t border-white/5 bg-[#050505] text-white";

export const SectionHeading = ({ eyebrow, title, description, align = "center" }) => {
    const alignment = align === "left" ? "items-start text-left" : "items-center text-center";

    return (
        <div className={`flex flex-col gap-4 ${alignment}`}>
            {eyebrow ? (
                <span className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-[#29D8D5] shadow-[0_0_0_1px_rgba(41,216,213,0.08)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#29D8D5] shadow-[0_0_18px_rgba(41,216,213,0.85)]" />
                    {eyebrow}
                </span>
            ) : null}
            <div className="max-w-4xl">
                <h2 className="text-3xl font-semibold tracking-tight text-white md:text-5xl md:leading-[1.05]">
                    {title}
                </h2>
                {description ? (
                    <p className="mt-4 text-sm leading-7 text-[#A9B3B8] md:text-lg">
                        {description}
                    </p>
                ) : null}
            </div>
        </div>
    );
};

export const OrbitalHero = ({
    eyebrow,
    title,
    subtitle,
    primaryCta,
    secondaryCta,
    onPrimary,
    onSecondary,
    stats,
    orbitLabels,
    footerNote = "Traceability on every movement",
    productImage = "/Inventory-management-system.webp",
    productImageAlt = "Ohnix inventory dashboard",
}) => {
    const [pointer, setPointer] = useState({ x: 50, y: 40 });

    return (
        <section
            id="home"
            className="relative overflow-hidden border-b border-white/5 bg-[radial-gradient(circle_at_top,rgba(41,216,213,0.12),transparent_24%),radial-gradient(circle_at_20%_20%,rgba(68,243,240,0.08),transparent_24%),linear-gradient(180deg,#070707_0%,#050505_36%,#050505_100%)]"
            onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                setPointer({ x, y });
            }}
        >
            <div className="absolute inset-0 opacity-60 [background-image:linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.03)_1px,transparent_1px)] [background-size:72px_72px]" />
            <div
                className="pointer-events-none absolute inset-0 opacity-70 transition-transform duration-300"
                style={{
                    transform: `translate3d(${(pointer.x - 50) * 0.14}px, ${(pointer.y - 50) * 0.14}px, 0)`,
                }}
            >
                <div className="absolute left-[10%] top-[8%] h-40 w-40 rounded-full border border-[#29D8D5]/10 blur-[1px]" />
                <div className="absolute right-[6%] top-[12%] h-56 w-56 rounded-full border border-white/10" />
                <div className="absolute bottom-[10%] left-[28%] h-24 w-24 rounded-full border border-[#44F3F0]/10" />
                <div className="absolute right-[20%] bottom-[18%] h-64 w-64 rounded-full border border-white/[0.06]" />
            </div>

            <div className="relative mx-auto max-w-7xl px-6 pb-20 pt-28 md:px-10 md:pb-28 lg:pt-32">
                <div className="grid items-center gap-14 lg:grid-cols-[1.03fr_0.97fr] lg:gap-20">
                    <div className="relative z-10">
                        <div className="inline-flex items-center gap-3 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-[#29D8D5]">
                            <span className="h-2 w-2 rounded-full bg-[#29D8D5] shadow-[0_0_16px_rgba(41,216,213,0.9)]" />
                            {eyebrow}
                        </div>

                        <h1 className="mt-7 max-w-3xl text-5xl font-semibold tracking-tight text-white md:text-7xl md:leading-[0.94]">
                            {title}
                        </h1>

                        <p className="mt-6 max-w-2xl text-base leading-8 text-[#A9B3B8] md:text-xl">
                            {subtitle}
                        </p>

                        <div className="mt-10 flex flex-col gap-4 sm:flex-row">
                            <button
                                type="button"
                                onClick={onPrimary}
                                className="group inline-flex items-center justify-center gap-3 rounded-full bg-[#29D8D5] px-6 py-3.5 text-sm font-semibold text-[#021314] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#44F3F0] hover:shadow-[0_0_40px_rgba(41,216,213,0.28)]"
                            >
                                {primaryCta}
                                <ArrowRightOutlined className="transition-transform duration-300 group-hover:translate-x-1" />
                            </button>
                            <button
                                type="button"
                                onClick={onSecondary}
                                className="group inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-[#29D8D5]/40 hover:bg-white/[0.06]"
                            >
                                <PlayCircleOutlined className="text-[#29D8D5] transition-transform duration-300 group-hover:scale-110" />
                                {secondaryCta}
                            </button>
                        </div>

                        <div className="mt-12 grid gap-4 sm:grid-cols-3">
                            {stats.map((stat) => (
                                <div
                                    key={stat.label}
                                    className="rounded-3xl border border-white/8 bg-white/[0.03] px-5 py-5 backdrop-blur-sm transition-all duration-300 hover:border-[#29D8D5]/30 hover:bg-white/[0.05]"
                                >
                                    <div className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
                                        {stat.value}
                                    </div>
                                    <div className="mt-2 text-sm text-[#A9B3B8]">
                                        {stat.label}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="relative mx-auto w-full max-w-[620px]">
                        <div className="absolute -inset-6 rounded-[40px] bg-[radial-gradient(circle_at_center,rgba(41,216,213,0.2),transparent_62%)] blur-2xl" />

                        <div className="relative overflow-hidden rounded-[32px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_24px_80px_rgba(0,0,0,0.55)] transition-transform duration-300 hover:-translate-y-1">
                            <div className="overflow-hidden rounded-[22px] border border-white/8 bg-[#0a0a0a]">
                                <img
                                    src={productImage}
                                    alt={productImageAlt}
                                    className="block w-full select-none"
                                />
                            </div>
                        </div>

                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                            {orbitLabels.map((label) => (
                                <span
                                    key={label}
                                    className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0B0B0B]/90 px-3 py-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[#A9B3B8] backdrop-blur-sm"
                                >
                                    <span className="h-2 w-2 rounded-full bg-[#44F3F0] shadow-[0_0_12px_rgba(68,243,240,0.85)]" />
                                    {label}
                                </span>
                            ))}
                        </div>

                        <div className="mt-5 flex items-center justify-center gap-3 rounded-full border border-white/10 bg-[#0B0B0B]/90 px-5 py-3 text-xs uppercase tracking-[0.22em] text-[#A9B3B8] backdrop-blur-md">
                            <span className="h-2 w-2 rounded-full bg-[#44F3F0] shadow-[0_0_16px_rgba(68,243,240,0.9)]" />
                            {footerNote}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
};

export const ContentSection = ({ id, children, className = "", shell = true }) => {
    const content = (
        <div className={`relative mx-auto max-w-7xl px-6 py-20 md:px-10 md:py-28 ${className}`}>
            {children}
        </div>
    );

    if (!shell) {
        return <section id={id}>{content}</section>;
    }

    return (
        <section id={id} className={sectionShell}>
            <div className="absolute inset-0 opacity-70 [background-image:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.04)_1px,transparent_0)] [background-size:34px_34px]" />
            {content}
        </section>
    );
};

export const CardGrid = ({ items, columns = 3, iconTone = "accent" }) => {
    const gridClass = {
        2: "md:grid-cols-2",
        3: "md:grid-cols-2 xl:grid-cols-3",
        4: "md:grid-cols-2 xl:grid-cols-4",
    }[columns] || "md:grid-cols-2 xl:grid-cols-3";

    return (
        <div className={`grid gap-5 ${gridClass}`}>
            {items.map((item) => {
                const iconClass =
                    iconTone === "accent"
                        ? "text-[#29D8D5]"
                        : "text-white";

                return (
                    <article
                        key={item.title}
                        className="group rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#29D8D5]/30 hover:bg-white/[0.05]"
                    >
                        <div className="flex items-start gap-4">
                            <div className={`rounded-2xl border border-white/10 bg-white/[0.04] p-3 ${iconClass}`}>
                                <span className="text-2xl">{item.icon}</span>
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-semibold tracking-tight text-white md:text-xl">
                                    {item.title}
                                </h3>
                                <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">
                                    {item.description}
                                </p>
                            </div>
                        </div>
                    </article>
                );
            })}
        </div>
    );
};

export const MissionVisionSection = ({ heading, mission, vision, valuesTitle, values }) => (
    <ContentSection id="about">
        <div className="grid gap-10 lg:grid-cols-[0.96fr_1.04fr] lg:items-start">
            <div>
                <SectionHeading
                    align="left"
                    eyebrow={heading.eyebrow}
                    title={heading.title}
                    description={heading.description}
                />
            </div>

            <div className="grid gap-5 md:grid-cols-2">
                <article className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <div className="mb-4 inline-flex rounded-full border border-[#29D8D5]/20 bg-[#29D8D5]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#44F3F0]">
                        {mission.label}
                    </div>
                    <h3 className="text-xl font-semibold text-white">{mission.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{mission.description}</p>
                </article>

                <article className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <div className="mb-4 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.3em] text-[#A9B3B8]">
                        {vision.label}
                    </div>
                    <h3 className="text-xl font-semibold text-white">{vision.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{vision.description}</p>
                </article>

                <div className="md:col-span-2 rounded-[28px] border border-white/8 bg-white/[0.03] p-6">
                    <h3 className="text-xl font-semibold text-white">{valuesTitle}</h3>
                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                        {values.map((value) => (
                            <div
                                key={value.title}
                                className="rounded-2xl border border-white/8 bg-[#070707] p-5 transition-all duration-300 hover:border-[#29D8D5]/25"
                            >
                                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#29D8D5]/10 text-[#29D8D5]">
                                    {value.icon}
                                </div>
                                <h4 className="mt-4 text-base font-semibold text-white">{value.title}</h4>
                                <p className="mt-2 text-sm leading-7 text-[#A9B3B8]">{value.description}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    </ContentSection>
);

export const CycleTimelineSection = ({ heading, steps }) => (
    <ContentSection id="timeline">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="relative mt-14">
            <div
                aria-hidden="true"
                className="pointer-events-none absolute left-[12.5%] right-[12.5%] top-7 hidden h-px bg-gradient-to-r from-transparent via-[#29D8D5]/35 to-transparent lg:block"
            />
            <div className="grid gap-5 lg:grid-cols-4">
            {steps.map((step, index) => (
                <article
                    key={step.title}
                    className="relative overflow-hidden rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#29D8D5]/30"
                >
                    <div className="absolute right-5 top-5 text-[11px] font-semibold uppercase tracking-[0.35em] text-[#A9B3B8]">
                        {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className="flex h-14 w-14 items-center justify-center rounded-[20px] border border-white/10 bg-[#29D8D5]/10 text-[#29D8D5]">
                        {step.icon}
                    </div>
                    <h3 className="mt-6 text-xl font-semibold text-white">{step.title}</h3>
                    <p className="mt-3 text-sm leading-7 text-[#A9B3B8]">{step.description}</p>
                </article>
            ))}
            </div>
        </div>
    </ContentSection>
);

export const MobileStickyCta = ({ primaryCta, secondaryCta, onPrimary, onSecondary }) => (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-[#050505]/95 p-4 backdrop-blur-xl md:hidden">
        <div className="mx-auto flex max-w-lg gap-3">
            <button
                type="button"
                onClick={onSecondary}
                className="flex-1 rounded-full border border-white/12 bg-white/[0.03] px-4 py-3 text-sm font-semibold text-white"
            >
                {secondaryCta}
            </button>
            <button
                type="button"
                onClick={onPrimary}
                className="flex-1 rounded-full bg-[#29D8D5] px-4 py-3 text-sm font-semibold text-[#021314]"
            >
                {primaryCta}
            </button>
        </div>
    </div>
);

export const ImpactMetricsSection = ({ heading, metrics }) => (
    <ContentSection id="impact">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-14 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
                <article
                    key={metric.label}
                    className="rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-6"
                >
                    <div className="text-4xl font-semibold tracking-tight text-white">
                        {metric.value}
                    </div>
                    <div className="mt-3 text-sm uppercase tracking-[0.28em] text-[#29D8D5]">
                        {metric.label}
                    </div>
                    <p className="mt-4 text-sm leading-7 text-[#A9B3B8]">{metric.description}</p>
                </article>
            ))}
        </div>
    </ContentSection>
);

export const TestimonialsSection = ({ heading, testimonials }) => (
    <ContentSection id="stories">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-14 grid gap-5 lg:grid-cols-3">
            {testimonials.map((testimonial) => (
                <article
                    key={testimonial.name}
                    className="rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 hover:-translate-y-1 hover:border-[#29D8D5]/30"
                >
                    <div className="text-3xl leading-none text-[#29D8D5]">“</div>
                    <p className="mt-4 text-sm leading-7 text-[#D4DBDF]">{testimonial.content}</p>
                    <div className="mt-8 border-t border-white/8 pt-5">
                        <div className="text-sm font-semibold text-white">{testimonial.name}</div>
                        <div className="mt-1 text-xs uppercase tracking-[0.3em] text-[#A9B3B8]">{testimonial.role}</div>
                    </div>
                </article>
            ))}
        </div>
    </ContentSection>
);

export const PartnersSection = ({ heading, partners }) => (
    <ContentSection id="partners">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-12 flex flex-wrap justify-center gap-4">
            {partners.map((partner) => (
                <div
                    key={partner}
                    className="rounded-full border border-white/8 bg-white/[0.03] px-5 py-3 text-sm text-[#D4DBDF] transition-all duration-300 hover:border-[#29D8D5]/35 hover:text-white"
                >
                    {partner}
                </div>
            ))}
        </div>
    </ContentSection>
);

export const FaqSection = ({ heading, items }) => (
    <ContentSection id="faq">
        <SectionHeading
            eyebrow={heading.eyebrow}
            title={heading.title}
            description={heading.description}
        />

        <div className="mt-14 grid gap-4 lg:grid-cols-2">
            {items.map((item) => (
                <details
                    key={item.question}
                    className="group rounded-[28px] border border-white/8 bg-white/[0.03] p-6 transition-all duration-300 open:border-[#29D8D5]/30 open:bg-white/[0.05]"
                >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left text-lg font-semibold text-white marker:hidden">
                        <span>{item.question}</span>
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-[#29D8D5] transition-transform duration-300 group-open:rotate-45">
                            <PlusIcon />
                        </span>
                    </summary>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-[#A9B3B8]">{item.answer}</p>
                </details>
            ))}
        </div>
    </ContentSection>
);

export const ContactSection = ({ heading, primaryCta, secondaryCta, onPrimary, onSecondary, contact }) => (
    <ContentSection id="contact">
        <div className="rounded-[36px] border border-white/8 bg-[radial-gradient(circle_at_top,rgba(41,216,213,0.12),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.02))] p-8 md:p-12 lg:p-16">
            <div className="grid gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
                <div>
                    <SectionHeading
                        align="left"
                        eyebrow={heading.eyebrow}
                        title={heading.title}
                        description={heading.description}
                    />

                    <div className="mt-8 flex flex-col gap-4 sm:flex-row">
                        <button
                            type="button"
                            onClick={onPrimary}
                            className="inline-flex items-center justify-center gap-3 rounded-full bg-[#29D8D5] px-6 py-3.5 text-sm font-semibold text-[#021314] transition-all duration-300 hover:-translate-y-0.5 hover:bg-[#44F3F0]"
                        >
                            {primaryCta}
                            <ArrowRightOutlined />
                        </button>
                        <button
                            type="button"
                            onClick={onSecondary}
                            className="inline-flex items-center justify-center gap-3 rounded-full border border-white/12 bg-white/[0.03] px-6 py-3.5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-[#29D8D5]/35 hover:bg-white/[0.06]"
                        >
                            {secondaryCta}
                        </button>
                    </div>
                </div>

                <div className="grid gap-4">
                    <div className="rounded-[28px] border border-white/8 bg-[#060606] p-6">
                        <div className="text-xs uppercase tracking-[0.35em] text-[#A9B3B8]">{contact.emailLabel}</div>
                        <a href={`mailto:${contact.email}`} className="mt-3 block text-2xl font-semibold text-white transition-colors duration-300 hover:text-[#44F3F0]">
                            {contact.email}
                        </a>
                    </div>
                    <div className="rounded-[28px] border border-white/8 bg-[#060606] p-6">
                        <div className="text-xs uppercase tracking-[0.35em] text-[#A9B3B8]">{contact.signalLabel}</div>
                        <p className="mt-3 text-sm leading-7 text-[#D4DBDF]">{contact.signalDescription}</p>
                    </div>
                </div>
            </div>
        </div>
    </ContentSection>
);

export const PlusIcon = () => (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M12 5v14M5 12h14" />
    </svg>
);

export const brandIcons = {
    lifecycle: <SyncOutlined />,
    assets: <DatabaseOutlined />,
    sustainability: <EnvironmentOutlined />,
    economy: <GlobalOutlined />,
    innovation: <ThunderboltOutlined />,
    observability: <LineChartOutlined />,
    identity: <TeamOutlined />,
    trust: <SafetyOutlined />,
    connect: <LinkOutlined />,
    api: <ApiOutlined />,
    adaptive: <RocketOutlined />,
    time: <ClockCircleOutlined />,
    action: <CheckCircleOutlined />,
    contact: <MailOutlined />,
    ideas: <QuestionCircleOutlined />,
    delight: <SmileOutlined />,
    facility: <ApartmentOutlined />,
};
