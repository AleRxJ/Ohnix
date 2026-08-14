import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AuthContext from "./AuthContext";
import { INVENTORY_TOUR_STEPS } from "../components/inventoryTour/inventoryTourSteps";

const InventoryTourContext = createContext(null);

const completedKeyFor = (userId) => `ohnix.app_tour.completed.${userId || "anon"}`;
const fabDismissedKeyFor = (userId) => `ohnix.app_tour.fab_dismissed.${userId || "anon"}`;
const lastStepKeyFor = (userId) => `ohnix.app_tour.last_step.${userId || "anon"}`;
const createdRefsKeyFor = (userId) => `ohnix.app_tour.created_refs.${userId || "anon"}`;

// Drives the "How does Ohnix work?" guided tour app-wide.
//
// Two things this fixes over a naive step-index tour:
// 1. isOpen doubles as the tagging signal every create-hook checks before
//    adding is_tutorial_data: true to its payload - so ANY record created
//    anywhere while the tour is open gets tagged, not just the one the
//    current step is nominally about.
// 2. notifyAction() lets those same hooks report "a real create/complete
//    just happened" back here - if it matches the CURRENT step's
//    `completesOn`, the tour auto-advances the instant the user finishes
//    filling the real form, instead of making them click a separate "done"
//    button. The card's own button is only a manual fallback for cases the
//    hook-level detection can't see (e.g. the user filled the form but the
//    request is still slow).
export const InventoryTourProvider = ({ children }) => {
    const { user } = useContext(AuthContext);
    const userId = user?.id || user?._id || null;

    const [isOpen, setIsOpen] = useState(false);
    const [stepIndex, setStepIndexState] = useState(0);
    const [completed, setCompleted] = useState(false);
    const [fabDismissed, setFabDismissed] = useState(false);
    const [ready, setReady] = useState(false);
    const [effectiveSteps, setEffectiveSteps] = useState([]);
    // What the tour has created so far in THIS session (id + display name),
    // keyed by kind ("category"/"unit"/"product"/"supplier"/"customer").
    // Later steps read this to pre-select the exact practice record instead
    // of leaving the user to guess which dropdown option is "the one they
    // just made" - e.g. the product-creation step pre-fills category_id/
    // unit_id from here, the purchase step pre-fills product_id/supplier_id.
    const [createdRefs, setCreatedRefs] = useState({});

    const userIdRef = useRef(userId);
    useEffect(() => {
        userIdRef.current = userId;
        setCompleted(localStorage.getItem(completedKeyFor(userId)) === "1");
        setFabDismissed(localStorage.getItem(fabDismissedKeyFor(userId)) === "1");
    }, [userId]);

    // Every step change (while the tour is running) is remembered so that
    // closing the tour - on purpose or by accident - and reopening it later
    // picks up right where the user left off, instead of dumping them back
    // at "Welcome" and making them redo steps they already finished.
    const setStepIndex = useCallback(
        (indexOrUpdater) => {
            setStepIndexState((prev) => {
                const next = typeof indexOrUpdater === "function" ? indexOrUpdater(prev) : indexOrUpdater;
                return next;
            });
        },
        []
    );

    useEffect(() => {
        if (!isOpen || effectiveSteps.length === 0) return;
        const currentStep = effectiveSteps[stepIndex];
        if (currentStep) {
            localStorage.setItem(lastStepKeyFor(userIdRef.current), currentStep.id);
        }
    }, [isOpen, stepIndex, effectiveSteps]);

    // createdRefs only lives in memory otherwise - persist it alongside the
    // step position so a full page reload (not just closing/reopening the
    // tour within the same session) can still resume with the right
    // category/unit/product/etc. references instead of losing them.
    useEffect(() => {
        if (!isOpen) return;
        localStorage.setItem(createdRefsKeyFor(userIdRef.current), JSON.stringify(createdRefs));
    }, [isOpen, createdRefs]);

    // Every step is now always walked through (no more "skip create-category
    // because the account already has one") - the tour is explicitly a
    // practice flow, so it always creates its own practice category/unit/
    // supplier/customer rather than silently pointing later steps at
    // whichever unrelated existing record happened to be first, which was
    // confusing ("no me dejó crear una categoría" / an unrecognized category
    // showing up pre-filled on the product step). That also means there's no
    // per-account state left to fetch before the steps list is known, so
    // start() is fully synchronous now.
    const start = useCallback(() => {
        setIsOpen(true);
        const effective = INVENTORY_TOUR_STEPS;
        setEffectiveSteps(effective);
        setReady(true);

        const savedId = localStorage.getItem(lastStepKeyFor(userIdRef.current));
        const resumeIndex = savedId ? effective.findIndex((s) => s.id === savedId) : -1;
        setStepIndexState(resumeIndex >= 0 ? resumeIndex : 0);

        if (resumeIndex >= 0) {
            try {
                const savedRefs = JSON.parse(localStorage.getItem(createdRefsKeyFor(userIdRef.current)) || "{}");
                setCreatedRefs(savedRefs);
            } catch {
                setCreatedRefs({});
            }
        } else {
            // Fresh start (not a resume) - clear out anything left over from
            // a previous, already-finished/abandoned practice session.
            setCreatedRefs({});
            localStorage.removeItem(createdRefsKeyFor(userIdRef.current));
        }
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    const finish = useCallback(() => {
        setIsOpen(false);
        setCompleted(true);
        setCreatedRefs({});
        localStorage.setItem(completedKeyFor(userIdRef.current), "1");
        localStorage.removeItem(lastStepKeyFor(userIdRef.current));
        localStorage.removeItem(createdRefsKeyFor(userIdRef.current));
    }, []);

    // "I don't need this anymore" - hides the floating trigger for good
    // (until localStorage is cleared), without touching completion state:
    // dismissing isn't the same as having gone through it.
    const dismissFab = useCallback(() => {
        setFabDismissed(true);
        localStorage.setItem(fabDismissedKeyFor(userIdRef.current), "1");
    }, []);

    // The one manual escape hatch: brings the floating trigger back after a
    // dismiss, and clears "completed" too so it counts as a fresh restart
    // rather than being immediately hidden again by the completed check in
    // InventoryTourFab.jsx. Surfaced in Profile > Account settings.
    const reEnableFab = useCallback(() => {
        setFabDismissed(false);
        setCompleted(false);
        localStorage.removeItem(fabDismissedKeyFor(userIdRef.current));
        localStorage.removeItem(completedKeyFor(userIdRef.current));
        localStorage.removeItem(lastStepKeyFor(userIdRef.current));
    }, []);

    // Refs mirroring the latest isOpen/stepIndex/effectiveSteps: notifyAction
    // needs to read "what step are we on RIGHT NOW" synchronously (not the
    // value from whatever render closed over it) and sometimes gets called
    // twice back-to-back in the same synchronous block - e.g. a purchase or
    // order created with its status already set to "completed" satisfies
    // both the "create X" and "complete X" steps in one request, and the
    // second call needs to see the index the first call just advanced to,
    // not a stale one. Plain useState updater functions can't chain like
    // that without their own re-render in between.
    const isOpenRef = useRef(isOpen);
    useEffect(() => {
        isOpenRef.current = isOpen;
    }, [isOpen]);

    const effectiveStepsRef = useRef(effectiveSteps);
    useEffect(() => {
        effectiveStepsRef.current = effectiveSteps;
    }, [effectiveSteps]);

    const stepIndexRef = useRef(stepIndex);
    useEffect(() => {
        stepIndexRef.current = stepIndex;
    }, [stepIndex]);

    // `ref` (optional) is the just-created record's { id, name } - stored
    // under `actionKind` so a later step's "open the form for me" handler
    // can pre-fill/pre-select it (see e.g. Products.jsx's handleAddProduct,
    // which reads createdRefs.category/unit to preselect them, or
    // PurchaseList.jsx's handleAddPurchase reading createdRefs.product).
    const notifyAction = useCallback((actionKind, ref) => {
        if (!isOpenRef.current) return false;
        const currentEffective = effectiveStepsRef.current;
        const prevIndex = stepIndexRef.current;
        const currentStep = currentEffective[prevIndex];
        if (currentStep?.completesOn !== actionKind) return false;

        const nextIndex = Math.min(prevIndex + 1, currentEffective.length - 1);
        stepIndexRef.current = nextIndex;
        setStepIndexState(nextIndex);
        if (ref) {
            setCreatedRefs((prev) => ({ ...prev, [actionKind]: ref }));
        }
        return true;
    }, []);

    const value = useMemo(
        () => ({
            isOpen,
            stepIndex,
            setStepIndex,
            completed,
            fabDismissed,
            ready,
            effectiveSteps,
            createdRefs,
            start,
            close,
            finish,
            dismissFab,
            reEnableFab,
            notifyAction,
        }),
        [isOpen, stepIndex, completed, fabDismissed, ready, effectiveSteps, createdRefs, start, close, finish, dismissFab, reEnableFab, notifyAction]
    );

    return <InventoryTourContext.Provider value={value}>{children}</InventoryTourContext.Provider>;
};

export const useInventoryTour = () => {
    const ctx = useContext(InventoryTourContext);
    if (!ctx) throw new Error("useInventoryTour must be used within InventoryTourProvider");
    return ctx;
};
