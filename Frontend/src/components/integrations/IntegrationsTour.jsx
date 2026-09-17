import { useEffect, useState } from "react";
import PropTypes from "prop-types";
import { createPortal } from "react-dom";
import { CloseOutlined, ArrowLeftOutlined, ArrowRightOutlined, CompassOutlined, CheckCircleFilled } from "@ant-design/icons";
import useI18n from "../../hooks/useI18n";

// A deliberately small, self-contained spotlight tour - NOT the same engine
// as components/inventoryTour/InventoryTour.jsx (that one drives multi-route
// navigation and "create a real record to advance" action steps; every
// target here already exists on this single page the moment the tour
// opens, so there's no polling, no route-change handling, no dialog-detection
// escape hatch to build). If a second single-page tour like this one shows
// up elsewhere, THEN it's worth extracting the shared bits into a generic
// <GuidedTour steps={...} /> - not before, per the "mini-tour aislado"
// decision for this one.
const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 360;
const CARD_MARGIN = 16;

const STEPS = [
    { id: "welcome", titleKey: "integrations_tour.welcome_title", descKey: "integrations_tour.welcome_desc" },
    { id: "api-keys", selector: '[data-tour="integrations-api-keys"]', titleKey: "integrations_tour.api_keys_title", descKey: "integrations_tour.api_keys_desc" },
    { id: "integrations", selector: '[data-tour="integrations-channels"]', titleKey: "integrations_tour.channels_title", descKey: "integrations_tour.channels_desc" },
    { id: "webhooks", selector: '[data-tour="integrations-webhooks"]', titleKey: "integrations_tour.webhooks_title", descKey: "integrations_tour.webhooks_desc" },
    { id: "finish", titleKey: "integrations_tour.finish_title", descKey: "integrations_tour.finish_desc" },
];

const IntegrationsTour = ({ open, onClose }) => {
    const { t } = useI18n();
    const [stepIndex, setStepIndex] = useState(0);
    const [rect, setRect] = useState(null);

    useEffect(() => {
        if (open) setStepIndex(0);
    }, [open]);

    const step = STEPS[stepIndex];

    useEffect(() => {
        if (!open || !step?.selector) {
            setRect(null);
            return;
        }
        const target = document.querySelector(step.selector);
        if (!target) {
            setRect(null);
            return;
        }
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        const measure = () => setRect(target.getBoundingClientRect());
        const timeout = setTimeout(measure, 300);
        window.addEventListener("resize", measure);
        window.addEventListener("scroll", measure, true);
        return () => {
            clearTimeout(timeout);
            window.removeEventListener("resize", measure);
            window.removeEventListener("scroll", measure, true);
        };
    }, [open, step]);

    if (!open) return null;

    const isFirst = stepIndex === 0;
    const isLast = step.id === "finish";
    const totalSteps = STEPS.length - 1; // exclude the finish screen from the count shown

    const cardPosition = (() => {
        if (!rect) return null;
        const viewportW = window.innerWidth;
        const viewportH = window.innerHeight;
        const spaceBelow = viewportH - rect.bottom;
        const placeBelow = spaceBelow > 240 || spaceBelow > rect.top;
        const left = Math.max(CARD_MARGIN, Math.min(rect.left + rect.width / 2 - CARD_WIDTH / 2, viewportW - CARD_WIDTH - CARD_MARGIN));
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
                key={step.id}
                className="rounded-2xl p-5 animate-fade-up"
                style={{ background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))" }}
            >
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#29D8D5]/15">
                            {isLast ? (
                                <CheckCircleFilled className="text-[#29D8D5] text-xs" />
                            ) : (
                                <CompassOutlined className="text-[#29D8D5] text-xs" />
                            )}
                        </div>
                        {!isLast && (
                            <span className="text-xs font-semibold tracking-wide text-[#29D8D5]">
                                {stepIndex + 1} / {totalSteps}
                            </span>
                        )}
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t("common.close")}
                        className="text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-primary)] transition-colors border-0 bg-transparent cursor-pointer p-1"
                    >
                        <CloseOutlined style={{ fontSize: 13 }} />
                    </button>
                </div>

                <h3 className="text-base font-bold text-[var(--ohnix-text-primary)] mb-1.5 leading-snug">{t(step.titleKey)}</h3>
                <p className="text-sm text-[var(--ohnix-text-muted)] leading-relaxed mb-4">{t(step.descKey)}</p>

                <div className="flex items-center justify-between gap-2">
                    {!isLast ? (
                        <button
                            type="button"
                            onClick={onClose}
                            className="text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer px-1"
                        >
                            {t("integrations_tour.skip")}
                        </button>
                    ) : (
                        <span />
                    )}
                    <div className="flex items-center gap-2">
                        {!isFirst && !isLast && (
                            <button
                                type="button"
                                onClick={() => setStepIndex(stepIndex - 1)}
                                className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-semibold border cursor-pointer"
                                style={{ borderColor: "var(--ohnix-line-4)", color: "var(--ohnix-text-primary)", background: "transparent" }}
                            >
                                <ArrowLeftOutlined style={{ fontSize: 11 }} />
                                {t("common.back")}
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={isLast ? onClose : () => setStepIndex(stepIndex + 1)}
                            className="flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-bold border-0 cursor-pointer"
                            style={{ background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)", color: "#021314" }}
                        >
                            {isLast ? t("integrations_tour.done") : t("common.next")}
                            {!isLast && <ArrowRightOutlined style={{ fontSize: 11 }} />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    return createPortal(
        <>
            {maskBoxes ? (
                <>
                    {maskBoxes.map((box, i) => (
                        <div key={i} className="fixed z-[2099] bg-black/55" style={box} onClick={onClose} />
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
                <div className="fixed inset-0 z-[2099] bg-black/60" onClick={onClose} />
            )}
            {card}
        </>,
        document.body
    );
};

IntegrationsTour.propTypes = {
    open: PropTypes.bool.isRequired,
    onClose: PropTypes.func.isRequired,
};

export default IntegrationsTour;
