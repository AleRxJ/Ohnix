import React, { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import {
    CloseOutlined,
    ArrowLeftOutlined,
    ArrowRightOutlined,
    CompassOutlined,
    CheckCircleFilled,
} from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { INVENTORY_TOUR_STEPS } from "./inventoryTourSteps";
import { tutorialDataService } from "../../services/tutorialDataService";

const POLL_INTERVAL_MS = 150;
const POLL_MAX_ATTEMPTS = 20; // ~3s, enough for a route change + data fetch
const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 360;
const CARD_MARGIN = 16;

// Custom-built instead of antd's <Tour>: this tour spans many routes and
// most targets don't exist until an earlier step creates them, so only one
// step's target is ever resolved in the DOM at a time. Driving navigation +
// element polling ourselves (rather than handing antd a steps array it
// expects to be fully navigable up front) avoids the "single-step array
// looks like its own last step and self-closes" bug the first version hit,
// and lets the styling match Ohnix instead of antd's defaults.
const InventoryTour = () => {
    const { isOpen, stepIndex, setStepIndex, close, finish, existingCounts } = useInventoryTour();
    const { t } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();
    const [targetEl, setTargetEl] = useState(undefined);
    const [purging, setPurging] = useState(false);

    const effectiveSteps = useMemo(() => {
        if (!existingCounts) return [];
        return INVENTORY_TOUR_STEPS.filter((s) => !s.skipIf || !s.skipIf(existingCounts));
    }, [existingCounts]);

    const totalSteps = effectiveSteps.length - 1; // exclude the "finish" screen from the count shown to the user
    const step = effectiveSteps[stepIndex];

    useEffect(() => {
        if (!isOpen || !step || step.kind === "finish") return;
        if (step.path && location.pathname !== step.path) {
            navigate(step.path);
        }
    }, [isOpen, step, location.pathname, navigate]);

    useEffect(() => {
        if (!isOpen || !step || !step.selector) {
            setTargetEl(step?.selector ? undefined : null);
            return;
        }
        if (step.path && location.pathname !== step.path) {
            setTargetEl(undefined);
            return;
        }

        let attempts = 0;
        let cancelled = false;
        setTargetEl(undefined);

        const interval = setInterval(() => {
            if (cancelled) return;
            const el = document.querySelector(step.selector);
            attempts += 1;
            if (el) {
                setTargetEl(el);
                clearInterval(interval);
            } else if (attempts >= POLL_MAX_ATTEMPTS) {
                setTargetEl(null);
                clearInterval(interval);
            }
        }, POLL_INTERVAL_MS);

        return () => {
            cancelled = true;
            clearInterval(interval);
        };
    }, [isOpen, step, location.pathname]);

    const [rect, setRect] = useState(null);
    useEffect(() => {
        if (!targetEl) {
            setRect(null);
            return;
        }
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
        const measure = () => setRect(targetEl.getBoundingClientRect());
        const timeout = setTimeout(measure, 350);
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        return () => {
            clearTimeout(timeout);
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
        };
    }, [targetEl]);

    if (!isOpen) return null;

    // existingCounts still loading (right after the FAB is clicked)
    if (!existingCounts || !step) {
        return createPortal(
            <div className="fixed inset-0 z-[2099] bg-black/60 flex items-center justify-center">
                <div className="rounded-2xl px-6 py-5 bg-[var(--ohnix-surface-card)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-muted)] text-sm">
                    {t("inventory_tour.loading")}
                </div>
            </div>,
            document.body
        );
    }

    const handlePurgeAndFinish = async () => {
        setPurging(true);
        try {
            await tutorialDataService.purge();
            toast.success(t("inventory_tour.cleanup_success"));
        } catch {
            toast.error(t("inventory_tour.cleanup_failed"));
        } finally {
            setPurging(false);
            finish();
        }
    };

    if (step.kind === "finish") {
        return createPortal(
            <>
                <div className="fixed inset-0 z-[2099] bg-black/65" />
                <div
                    className="fixed z-[2101] rounded-2xl p-px"
                    style={{
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: CARD_WIDTH + 40,
                        maxWidth: "calc(100vw - 32px)",
                        background: "linear-gradient(135deg, rgba(41,216,213,0.6), rgba(124,106,247,0.4))",
                        boxShadow: "0 24px 70px rgba(0,0,0,0.55)",
                    }}
                >
                    <div
                        className="rounded-2xl p-7 text-center"
                        style={{ background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))" }}
                    >
                        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#29D8D5]/15">
                            <CheckCircleFilled className="text-3xl text-[#29D8D5]" />
                        </div>
                        <h3 className="text-lg font-bold text-[var(--ohnix-text-primary)] mb-2">
                            {t("inventory_tour.finish_title")}
                        </h3>
                        <p className="text-sm text-[var(--ohnix-text-muted)] leading-relaxed mb-6">
                            {t("inventory_tour.finish_desc")}
                        </p>
                        <div className="flex flex-col gap-2.5">
                            <button
                                type="button"
                                onClick={handlePurgeAndFinish}
                                disabled={purging}
                                className="h-11 rounded-xl text-sm font-bold border-0 cursor-pointer disabled:opacity-60"
                                style={{
                                    background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)",
                                    color: "#021314",
                                }}
                            >
                                {purging ? t("inventory_tour.cleaning_up") : t("inventory_tour.cleanup_button")}
                            </button>
                            <button
                                type="button"
                                onClick={finish}
                                disabled={purging}
                                className="h-11 rounded-xl text-sm font-semibold border cursor-pointer"
                                style={{ borderColor: "var(--ohnix-line-4)", color: "var(--ohnix-text-primary)", background: "transparent" }}
                            >
                                {t("inventory_tour.keep_practice_button")}
                            </button>
                        </div>
                    </div>
                </div>
            </>,
            document.body
        );
    }

    if (targetEl === undefined) return null;

    const isFirst = stepIndex === 0;
    const isAction = step.kind === "action";

    const handleNext = () => setStepIndex(stepIndex + 1);
    const handlePrev = () => setStepIndex(stepIndex - 1);
    const handleOpenTarget = () => {
        if (targetEl && typeof targetEl.click === "function") {
            targetEl.click();
        }
    };

    const cardPosition = (() => {
        if (!rect) return null;
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const spaceBelow = viewportH - rect.bottom;
        const placeBelow = spaceBelow > 240 || spaceBelow > rect.top;
        const left = Math.max(
            CARD_MARGIN,
            Math.min(rect.left + rect.width / 2 - CARD_WIDTH / 2, viewportW - CARD_WIDTH - CARD_MARGIN)
        );
        return placeBelow
            ? { top: rect.bottom + SPOTLIGHT_PADDING + 14, left, transform: "none" }
            : { top: rect.top - SPOTLIGHT_PADDING - 14, left, transform: "translateY(-100%)" };
    })();

    const maskBoxes = rect
        ? [
              { top: 0, left: 0, width: "100vw", height: Math.max(0, rect.top - SPOTLIGHT_PADDING) },
              { top: rect.bottom + SPOTLIGHT_PADDING, left: 0, width: "100vw", height: `calc(100vh - ${rect.bottom + SPOTLIGHT_PADDING}px)` },
              { top: rect.top - SPOTLIGHT_PADDING, left: 0, width: Math.max(0, rect.left - SPOTLIGHT_PADDING), height: rect.height + SPOTLIGHT_PADDING * 2 },
              { top: rect.top - SPOTLIGHT_PADDING, left: rect.right + SPOTLIGHT_PADDING, width: `calc(100vw - ${rect.right + SPOTLIGHT_PADDING}px)`, height: rect.height + SPOTLIGHT_PADDING * 2 },
          ]
        : null;

    const card = (
        <div
            className="fixed z-[2101] rounded-2xl p-px"
            style={{
                width: CARD_WIDTH,
                maxWidth: "calc(100vw - 32px)",
                ...(rect && cardPosition
                    ? { top: cardPosition.top, left: cardPosition.left, transform: cardPosition.transform }
                    : { top: "50%", left: "50%", transform: "translate(-50%, -50%)" }),
                background: "linear-gradient(135deg, rgba(41,216,213,0.55), rgba(124,106,247,0.35))",
                boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
        >
            <div
                className="rounded-2xl p-5"
                style={{ background: "linear-gradient(180deg, rgba(10,10,10,0.98), rgba(7,7,7,0.98))" }}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#29D8D5]/15">
                            <CompassOutlined className="text-[#29D8D5] text-xs" />
                        </div>
                        <span className="text-xs font-semibold tracking-wide text-[#29D8D5]">
                            {stepIndex + 1} / {totalSteps}
                        </span>
                        {isAction && (
                            <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[#7C6AF7]/20 text-[#b3a6ff]">
                                {t("inventory_tour.badge_action")}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={close}
                        aria-label={t("common.close")}
                        className="text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-primary)] transition-colors border-0 bg-transparent cursor-pointer p-1"
                    >
                        <CloseOutlined style={{ fontSize: 13 }} />
                    </button>
                </div>

                <h3 className="text-base font-bold text-[var(--ohnix-text-primary)] mb-1.5 leading-snug">
                    {t(step.titleKey)}
                </h3>
                <p className="text-sm text-[var(--ohnix-text-muted)] leading-relaxed mb-4">
                    {t(step.descKey)}
                </p>

                {isAction ? (
                    <div className="flex flex-col gap-2">
                        <div className="flex gap-2">
                            {targetEl && step.id !== "complete-order" && (
                                <button
                                    type="button"
                                    onClick={handleOpenTarget}
                                    className="flex-1 h-9 rounded-lg text-xs font-semibold border cursor-pointer"
                                    style={{ borderColor: "var(--ohnix-line-4)", color: "var(--ohnix-text-primary)", background: "transparent" }}
                                >
                                    {t("inventory_tour.open_for_me")}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleNext}
                                className="flex-1 h-9 rounded-lg text-xs font-bold border-0 cursor-pointer flex items-center justify-center gap-1.5"
                                style={{ background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)", color: "#021314" }}
                            >
                                <CheckCircleFilled style={{ fontSize: 12 }} />
                                {t("inventory_tour.done_continue")}
                            </button>
                        </div>
                        <div className="flex items-center justify-between">
                            {!isFirst && (
                                <button
                                    type="button"
                                    onClick={handlePrev}
                                    className="text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer px-1 flex items-center gap-1"
                                >
                                    <ArrowLeftOutlined style={{ fontSize: 10 }} />
                                    {t("common.back")}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleNext}
                                className="text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer px-1 ml-auto"
                            >
                                {t("inventory_tour.skip_step")}
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center justify-between gap-2">
                        <button
                            type="button"
                            onClick={close}
                            className="text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer px-1"
                        >
                            {t("inventory_tour.skip")}
                        </button>
                        <div className="flex items-center gap-2">
                            {!isFirst && (
                                <button
                                    type="button"
                                    onClick={handlePrev}
                                    className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border cursor-pointer"
                                    style={{ borderColor: "var(--ohnix-line-4)", color: "var(--ohnix-text-primary)", background: "transparent" }}
                                >
                                    <ArrowLeftOutlined style={{ fontSize: 11 }} />
                                    {t("common.back")}
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={handleNext}
                                className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-bold border-0 cursor-pointer"
                                style={{ background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)", color: "#021314" }}
                            >
                                {t("common.next")}
                                <ArrowRightOutlined style={{ fontSize: 11 }} />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    return createPortal(
        <>
            {maskBoxes ? (
                <>
                    {maskBoxes.map((box, i) => (
                        <div key={i} className="fixed z-[2099] bg-black/55" style={box} onClick={close} />
                    ))}
                    <div
                        className="fixed z-[2100] rounded-xl pointer-events-none"
                        style={{
                            top: rect.top - SPOTLIGHT_PADDING,
                            left: rect.left - SPOTLIGHT_PADDING,
                            width: rect.width + SPOTLIGHT_PADDING * 2,
                            height: rect.height + SPOTLIGHT_PADDING * 2,
                            boxShadow: "0 0 0 3px #29D8D5, 0 0 24px 4px rgba(41,216,213,0.55)",
                            transition: "top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease",
                        }}
                    />
                </>
            ) : (
                <div className="fixed inset-0 z-[2099] bg-black/60" onClick={close} />
            )}
            {card}
        </>,
        document.body
    );
};

export default InventoryTour;
