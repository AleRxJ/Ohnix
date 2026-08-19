import React, { useEffect, useRef, useState } from "react";
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
import { tutorialDataService } from "../../services/tutorialDataService";

const POLL_INTERVAL_MS = 150;
const POLL_MAX_ATTEMPTS = 20; // ~3s, enough for a route change + data fetch
const DIALOG_POLL_MS = 200;
const SPOTLIGHT_PADDING = 8;
const CARD_WIDTH = 360;
const CARD_MARGIN = 16;

// Any antd overlay that's actually open and visible (not just
// mounted-but-hidden, which antd does for closed dialogs unless
// destroyOnClose is set) - Modal/Drawer, but also Popconfirm/Popover and
// Select/Dropdown menus. All of these render via a portal straight onto
// <body>, so they sit outside whatever the mask's spotlight hole was cut
// for; when their popup content extends past that hole (e.g. a Popconfirm's
// "Yes" button appearing above the row action button it's anchored to,
// which is exactly what "mark purchase completed" does), the mask's own
// click-to-close bands were sitting on top of it and eating the click meant
// for the real button - the fix is the same as for Modals: detect ANY of
// these and get the mask out of the way entirely, not just Modal/Drawer.
const findOpenDialog = () => {
    const candidates = document.querySelectorAll(
        ".ant-modal-content, .ant-drawer-content-wrapper, .ant-popover:not(.ant-popover-hidden), .ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-dropdown:not(.ant-dropdown-hidden)"
    );
    for (const el of candidates) {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return el;
    }
    return null;
};

// Custom-built instead of antd's <Tour>: this tour spans many routes and
// most targets don't exist until an earlier step creates them, so only one
// step's target is ever resolved in the DOM at a time. Driving navigation +
// element polling ourselves (rather than handing antd a steps array it
// expects to be fully navigable up front) avoids the "single-step array
// looks like its own last step and self-closes" bug the first version hit,
// and lets the styling match Ohnix instead of antd's defaults.
//
// The other thing this owns: once an "action" step's real Modal/Drawer is
// actually open, the full-screen spotlight mask gets out of the way
// entirely (it used to sit at a higher z-index than antd's own dialogs and
// visually block/intercept clicks into the very form the step was asking
// the user to fill in) and shrinks to a small corner note instead, so nothing
// stands between the user and the real form.
// Steps whose selector matches every row of a table (every purchase/order
// shares the same data-tour attribute, including pre-existing real ones) -
// once the create step has tracked the exact record's id via notifyAction's
// ref, narrow the query to that specific row instead of grabbing whichever
// one happens to render first.
const ROW_ID_ATTR_BY_STEP_ID = {
    "complete-purchase": { refKind: "purchase", attr: "data-purchase-id" },
    "complete-order": { refKind: "order", attr: "data-order-id" },
};

const InventoryTour = () => {
    const { isOpen, stepIndex, setStepIndex, close, finish, ready, effectiveSteps, createdRefs } = useInventoryTour();
    const { t } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();
    const [targetEl, setTargetEl] = useState(undefined);
    const [purging, setPurging] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);

    const totalSteps = effectiveSteps.length - 1; // exclude the "finish" screen from the count shown to the user
    const step = effectiveSteps[stepIndex];

    // Covers the route swap with a brief animated "taking you there" beat
    // instead of letting the destination page just pop in instantly the
    // moment navigate() fires - a page-to-page jump used to look like a
    // hard cut with nothing in between.
    const [pageTransitioning, setPageTransitioning] = useState(false);
    useEffect(() => {
        if (!isOpen || !step || step.kind === "finish") return;
        if (step.path && location.pathname !== step.path) {
            setPageTransitioning(true);
            navigate(step.path);
        }
    }, [isOpen, step, location.pathname, navigate]);

    // Holds the transition overlay for a short fixed beat once we've
    // actually landed on the destination route - deliberately not tied to
    // data having finished loading (the target-polling below already covers
    // that separately), just long enough to read as a guided handoff rather
    // than an instant swap.
    useEffect(() => {
        if (!pageTransitioning) return;
        if (step?.path && location.pathname !== step.path) return;
        const timeout = setTimeout(() => setPageTransitioning(false), 500);
        return () => clearTimeout(timeout);
    }, [pageTransitioning, location.pathname, step]);

    // Which step's target `targetEl` currently points at - a ref (not
    // state) specifically so it updates synchronously the instant a step
    // changes, in the same commit. Without this, the auto-open effect below
    // (which also runs in that commit, since effects fire in declaration
    // order) would still see the PREVIOUS step's targetEl - state updates
    // scheduled inside an effect don't apply until the next render - and
    // auto-click that stale, already-used target again (e.g. re-clicking
    // "Add category" right after category was created and the tour moved on
    // to create-unit), which is what was reopening an empty modal.
    const targetElStepIdRef = useRef(null);
    useEffect(() => {
        if (!isOpen || !step || !step.selector) {
            setTargetEl(step?.selector ? undefined : null);
            targetElStepIdRef.current = null;
            return;
        }
        if (step.path && location.pathname !== step.path) {
            setTargetEl(undefined);
            targetElStepIdRef.current = null;
            return;
        }

        let attempts = 0;
        let cancelled = false;
        setTargetEl(undefined);
        targetElStepIdRef.current = null;

        const rowMatch = ROW_ID_ATTR_BY_STEP_ID[step.id];
        const trackedId = rowMatch ? createdRefs?.[rowMatch.refKind]?.id : null;
        const effectiveSelector = trackedId
            ? `${step.selector}[${rowMatch.attr}="${trackedId}"]`
            : step.selector;

        const interval = setInterval(() => {
            if (cancelled) return;
            attempts += 1;
            const exact = document.querySelector(effectiveSelector);
            // The create/complete hook fires notifyAction() (which starts
            // this poll) before its own refetch resolves, so the tracked
            // row genuinely isn't in the DOM yet for the first several
            // ticks - that's expected, not a failure. Only fall back to
            // "any row matching the shared selector" (which real,
            // pre-existing purchases/orders share too, e.g. QA fixtures or
            // other pending records) once we're almost out of polling
            // budget, so it stays a last resort for stale/resumed sessions
            // predating the id-tagging fix, not the default path.
            const el =
                exact ||
                (trackedId && attempts >= POLL_MAX_ATTEMPTS - 3
                    ? document.querySelector(step.selector)
                    : null);
            if (el) {
                setTargetEl(el);
                targetElStepIdRef.current = step.id;
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
    }, [isOpen, step, location.pathname, createdRefs]);

    // Auto-open the step's target the moment it's found, instead of making
    // the user hunt for and click "Open it for me" themselves - guarded by
    // stepIndex so it only fires once per step (a user closing the modal
    // without finishing shouldn't have it snap back open on every poll
    // tick; they can still reopen it manually).
    const autoOpenedForStepRef = useRef(-1);
    useEffect(() => {
        if (!isOpen || step?.kind !== "action") return;
        if (step.completesOn && createdRefs?.[step.completesOn]) return; // already done - see alreadyDoneRef below
        if (!targetEl || typeof targetEl.click !== "function") return;
        if (targetElStepIdRef.current !== step.id) return;
        if (autoOpenedForStepRef.current === stepIndex) return;
        autoOpenedForStepRef.current = stepIndex;
        targetEl.click();
    }, [isOpen, step, stepIndex, targetEl, createdRefs]);

    // Watch for any antd overlay opening/closing so the mask can step out of
    // the way - checked on every step that targets an element (not just
    // action/opensDialog: true ones) since a Popconfirm, a Select's dropdown
    // menu, or a Drawer left open by the PREVIOUS step (e.g. "view-history"
    // opens the product details drawer and nothing closes it before the
    // tour moves on to "low-stock-alerts", an info step pointing at a button
    // that drawer now sits on top of) can still be open when this step
    // renders. Without this, the spotlight box gets drawn around the real
    // target's coordinates while the drawer's unrelated content is what's
    // actually visible there, making the highlight look misaligned.
    useEffect(() => {
        if (!isOpen || !step?.selector) {
            setDialogOpen(false);
            return;
        }
        const interval = setInterval(() => {
            setDialogOpen(Boolean(findOpenDialog()));
        }, DIALOG_POLL_MS);
        return () => clearInterval(interval);
    }, [isOpen, step]);

    const [rect, setRect] = useState(null);
    useEffect(() => {
        if (!targetEl || dialogOpen) {
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
    }, [targetEl, dialogOpen]);

    if (!isOpen) return null;

    // Not ready yet (right after the FAB is clicked, before start() commits)
    if (!ready || effectiveSteps.length === 0 || !step) {
        return createPortal(
            <div className="fixed inset-0 z-[2099] bg-black/60 flex items-center justify-center">
                <div className="rounded-2xl px-6 py-5 bg-[var(--ohnix-surface-card)] border border-[var(--ohnix-line-4)] text-[var(--ohnix-text-muted)] text-sm">
                    {t("inventory_tour.loading")}
                </div>
            </div>,
            document.body
        );
    }

    // Traveling beat between pages - the destination step's own title/desc
    // preview here doubles as a little "here's what's next" reveal instead
    // of the new page just appearing with the card already fully formed.
    if (pageTransitioning) {
        return createPortal(
            <div className="fixed inset-0 z-[2099] flex items-center justify-center bg-black/75">
                <div key={step.id} className="animate-fade-up flex flex-col items-center text-center px-6">
                    <div className="ohnix-tour-compass mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#29D8D5]/15">
                        <CompassOutlined className="text-2xl text-[#29D8D5]" />
                    </div>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-[#29D8D5] mb-2">
                        {t("inventory_tour.navigating_hint")}
                    </p>
                    <h3 className="text-base font-bold text-[var(--ohnix-text-primary)]">
                        {t(step.titleKey)}
                    </h3>
                </div>
                <style>{`
                    .ohnix-tour-compass {
                        animation: ohnix-tour-compass-spin 1.1s cubic-bezier(0.65,0,0.35,1) infinite;
                    }
                    @keyframes ohnix-tour-compass-spin {
                        0%, 100% { transform: rotate(-12deg); }
                        50% { transform: rotate(12deg); }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        .ohnix-tour-compass { animation: none; }
                    }
                `}</style>
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
                        style={{ background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))" }}
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

    const isFirst = stepIndex === 0;
    const isAction = step.kind === "action";
    // Going Back can land on a "create X" step whose X was already created
    // (createdRefs is only ever populated by a REAL notifyAction ref, so
    // this reflects something that genuinely happened, not a guess) -
    // presenting it again as "go create this" invited creating a duplicate.
    // Detected generically: every creation step's `completesOn` is exactly
    // the createdRefs key its own notifyAction call fills in.
    const alreadyDoneRef = isAction ? createdRefs?.[step.completesOn] : null;
    // Only "info" steps get a manual Next - "action" steps only ever move
    // forward via notifyAction(), fired by the exact same create/complete
    // hook that persists the real record. There is deliberately no "I did
    // it" button here: this tour drives the user through creating real
    // practice data in order (category -> unit -> product -> ...), and
    // every later step assumes the earlier ones actually happened. A manual
    // fake-advance would let the chain desync - e.g. reaching "create
    // product" with no category/unit to pick from - which is exactly the
    // bug this replaces.
    const handleNext = () => setStepIndex(stepIndex + 1);
    const handlePrev = () => setStepIndex(stepIndex - 1);

    // A real Modal/Drawer is open on top of us - shrink to a small,
    // non-blocking corner note instead of covering the screen. No mask, no
    // spotlight, nothing between the user and the form they're filling in.
    if (dialogOpen) {
        return createPortal(
            <div
                className="fixed z-[2101] bottom-6 left-6 rounded-2xl p-px"
                style={{
                    width: 320,
                    maxWidth: "calc(100vw - 32px)",
                    background: "linear-gradient(135deg, rgba(41,216,213,0.55), rgba(124,106,247,0.35))",
                    boxShadow: "0 12px 34px rgba(0,0,0,0.4)",
                }}
            >
                <div
                    key={step.id}
                    className="rounded-2xl p-4 animate-fade-up"
                    style={{ background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))" }}
                >
                    <div className="flex items-center gap-2 mb-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#29D8D5]/15 flex-shrink-0">
                            <CompassOutlined className="text-[#29D8D5]" style={{ fontSize: 11 }} />
                        </div>
                        <span className="text-xs font-semibold tracking-wide text-[#29D8D5]">
                            {stepIndex + 1} / {totalSteps}
                        </span>
                    </div>
                    <h3 className="text-xs font-bold text-[var(--ohnix-text-primary)] mb-1 leading-snug">
                        {t(step.titleKey)}
                    </h3>
                    <p className="text-xs text-[var(--ohnix-text-muted)] leading-relaxed mb-3">
                        {t(step.descKey)}
                    </p>
                    <p className="text-[10px] text-[var(--ohnix-text-dim)] m-0 mb-2">
                        {t("inventory_tour.auto_advance_hint")}
                    </p>
                    <div className="flex items-center justify-end">
                        <button
                            type="button"
                            onClick={close}
                            className="text-[11px] text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer"
                        >
                            {t("inventory_tour.pause_tour")}
                        </button>
                    </div>
                </div>
            </div>,
            document.body
        );
    }

    if (targetEl === undefined) return null;

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
                key={step.id}
                className="rounded-2xl p-5 animate-fade-up"
                style={{ background: "linear-gradient(180deg, var(--ohnix-surface-card), var(--ohnix-surface-card-soft))" }}
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
                    {alreadyDoneRef
                        ? t("inventory_tour.already_done_desc", { name: alreadyDoneRef.name })
                        : t(step.descKey)}
                </p>

                {isAction ? (
                    alreadyDoneRef ? (
                        // Reached via Back after the real creation already
                        // happened (createdRefs only holds a ref once
                        // notifyAction fired for real) - the only case where a
                        // manual "continue" button is safe, since nothing is
                        // being faked here.
                        <div className="flex flex-col gap-2">
                            <button
                                type="button"
                                onClick={handleNext}
                                className="h-9 rounded-lg text-xs font-bold border-0 cursor-pointer flex items-center justify-center gap-1.5"
                                style={{ background: "linear-gradient(135deg, #29D8D5 0%, #44F3F0 100%)", color: "#021314" }}
                            >
                                {t("common.next")}
                                <ArrowRightOutlined style={{ fontSize: 11 }} />
                            </button>
                            <div className="flex items-center justify-between">
                                {!isFirst ? (
                                    <button
                                        type="button"
                                        onClick={handlePrev}
                                        className="text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer px-1 flex items-center gap-1"
                                    >
                                        <ArrowLeftOutlined style={{ fontSize: 10 }} />
                                        {t("common.back")}
                                    </button>
                                ) : (
                                    <span />
                                )}
                                <button
                                    type="button"
                                    onClick={close}
                                    className="text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer px-1"
                                >
                                    {t("inventory_tour.pause_tour")}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="flex flex-col gap-2">
                            {targetEl && step.id !== "complete-order" && (
                                <button
                                    type="button"
                                    onClick={handleOpenTarget}
                                    className="h-9 rounded-lg text-xs font-semibold border cursor-pointer"
                                    style={{ borderColor: "var(--ohnix-line-4)", color: "var(--ohnix-text-primary)", background: "transparent" }}
                                >
                                    {t("inventory_tour.open_for_me")}
                                </button>
                            )}
                            <p className="text-[11px] text-[var(--ohnix-text-dim)] text-center m-0">
                                {t("inventory_tour.auto_advance_hint")}
                            </p>
                            <div className="flex items-center justify-between">
                                {!isFirst ? (
                                    <button
                                        type="button"
                                        onClick={handlePrev}
                                        className="text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer px-1 flex items-center gap-1"
                                    >
                                        <ArrowLeftOutlined style={{ fontSize: 10 }} />
                                        {t("common.back")}
                                    </button>
                                ) : (
                                    <span />
                                )}
                                <button
                                    type="button"
                                    onClick={close}
                                    className="text-xs text-[var(--ohnix-text-dim)] hover:text-[var(--ohnix-text-muted)] border-0 bg-transparent cursor-pointer px-1"
                                >
                                    {t("inventory_tour.pause_tour")}
                                </button>
                            </div>
                        </div>
                    )
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
