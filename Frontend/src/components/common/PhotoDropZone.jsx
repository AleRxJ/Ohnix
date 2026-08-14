import React from "react";
import { CameraOutlined, EditOutlined } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

// Small viewfinder-style corner marks - a nod to the fact this is
// specifically a *photo* drop zone, not a generic file uploader. Transparent
// at rest, fade to the brand teal on hover via a border-color transition
// (cheaper and smoother than toggling a class).
const CornerMarks = () => (
    <>
        <span className="pointer-events-none absolute top-3 left-3 h-4 w-4 rounded-tl-md border-t-2 border-l-2 border-[#29D8D5]/0 transition-colors duration-300 group-hover:border-[#29D8D5]/70" />
        <span className="pointer-events-none absolute top-3 right-3 h-4 w-4 rounded-tr-md border-t-2 border-r-2 border-[#29D8D5]/0 transition-colors duration-300 group-hover:border-[#29D8D5]/70" />
        <span className="pointer-events-none absolute bottom-3 left-3 h-4 w-4 rounded-bl-md border-b-2 border-l-2 border-[#29D8D5]/0 transition-colors duration-300 group-hover:border-[#29D8D5]/70" />
        <span className="pointer-events-none absolute bottom-3 right-3 h-4 w-4 rounded-br-md border-b-2 border-r-2 border-[#29D8D5]/0 transition-colors duration-300 group-hover:border-[#29D8D5]/70" />
    </>
);

const PhotoDropZone = ({ imageUrl, title, subtitle, height = "h-48 sm:h-56 md:h-64" }) => {
    const { t } = useI18n();

    if (imageUrl) {
        return (
            <div
                className={`group relative w-full ${height} rounded-2xl overflow-hidden border border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] cursor-pointer transition-colors duration-300 hover:border-[#29D8D5]/70`}
            >
                <img
                    src={imageUrl}
                    alt=""
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/0 opacity-0 transition-all duration-300 group-hover:bg-black/55 group-hover:opacity-100">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/30 bg-white/10 backdrop-blur-sm">
                        <EditOutlined className="text-base text-white" />
                    </div>
                    <span className="text-xs font-semibold tracking-wide text-white">
                        {t("common.change_photo")}
                    </span>
                </div>
                <CornerMarks />
            </div>
        );
    }

    return (
        <div
            className={`ohnix-photo-dropzone group relative flex w-full ${height} cursor-pointer items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed border-[var(--ohnix-line-5)] bg-[var(--ohnix-line-1)] transition-all duration-300 hover:border-[#29D8D5]/60 hover:bg-[var(--ohnix-hover-overlay)]`}
        >
            <div className="relative z-10 flex flex-col items-center justify-center gap-3 px-6 text-center">
                <div className="relative flex items-center justify-center">
                    <span className="ohnix-photo-pulse absolute h-14 w-14 rounded-full bg-[#29D8D5]/25" />
                    <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#29D8D5] to-[#44F3F0] shadow-[0_8px_20px_rgba(41,216,213,0.35)] transition-transform duration-300 group-hover:scale-105">
                        <CameraOutlined className="text-xl text-[#021314]" />
                    </div>
                </div>
                <div>
                    <p className="mb-2 text-sm font-semibold text-[var(--ohnix-text-primary)]">
                        {title}
                    </p>
                    {subtitle && (
                        <span className="inline-block rounded-full border border-[var(--ohnix-line-4)] bg-[var(--ohnix-line-2)] px-3 py-1 text-[10px] font-medium uppercase tracking-wide text-[var(--ohnix-text-muted)]">
                            {subtitle}
                        </span>
                    )}
                </div>
            </div>
            <CornerMarks />
            <style>{`
                .ohnix-photo-pulse {
                    animation: ohnix-photo-pulse-anim 2.4s ease-in-out infinite;
                }
                @keyframes ohnix-photo-pulse-anim {
                    0%, 100% { transform: scale(1); opacity: 0.5; }
                    50% { transform: scale(1.4); opacity: 0; }
                }
                @media (prefers-reduced-motion: reduce) {
                    .ohnix-photo-pulse { animation: none; }
                }
            `}</style>
        </div>
    );
};

export default PhotoDropZone;
