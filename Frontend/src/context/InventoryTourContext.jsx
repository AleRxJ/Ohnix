import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AuthContext from "./AuthContext";
import { api } from "../api/api";
import { INVENTORY_TOUR_STEPS } from "../components/inventoryTour/inventoryTourSteps";

const InventoryTourContext = createContext(null);

const completedKeyFor = (userId) => `ohnix.app_tour.completed.${userId || "anon"}`;
const fabDismissedKeyFor = (userId) => `ohnix.app_tour.fab_dismissed.${userId || "anon"}`;
const lastStepKeyFor = (userId) => `ohnix.app_tour.last_step.${userId || "anon"}`;

const fetchExistingCounts = async () => {
    const [categories, units, suppliers, customers] = await Promise.all([
        api.get("/categories/available").catch(() => ({ data: { data: [] } })),
        api.get("/units/available").catch(() => ({ data: { data: [] } })),
        api.get("/suppliers").catch(() => ({ data: { data: [] } })),
        api.get("/customers").catch(() => ({ data: { data: [] } })),
    ]);
    return {
        categories: categories.data?.data?.length || 0,
        units: units.data?.data?.length || 0,
        suppliers: suppliers.data?.data?.length || 0,
        customers: customers.data?.data?.length || 0,
    };
};

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
    const [existingCounts, setExistingCounts] = useState(null);
    const [effectiveSteps, setEffectiveSteps] = useState([]);

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

    const start = useCallback(async () => {
        setIsOpen(true);
        setExistingCounts(null);
        setEffectiveSteps([]);
        let counts;
        try {
            counts = await fetchExistingCounts();
        } catch {
            counts = { categories: 0, units: 0, suppliers: 0, customers: 0 };
        }
        const effective = INVENTORY_TOUR_STEPS.filter((s) => !s.skipIf || !s.skipIf(counts));
        setExistingCounts(counts);
        setEffectiveSteps(effective);

        const savedId = localStorage.getItem(lastStepKeyFor(userIdRef.current));
        const resumeIndex = savedId ? effective.findIndex((s) => s.id === savedId) : -1;
        setStepIndexState(resumeIndex >= 0 ? resumeIndex : 0);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    const finish = useCallback(() => {
        setIsOpen(false);
        setCompleted(true);
        localStorage.setItem(completedKeyFor(userIdRef.current), "1");
        localStorage.removeItem(lastStepKeyFor(userIdRef.current));
    }, []);

    // "I don't need this anymore" - hides the floating trigger for good
    // (until localStorage is cleared), without touching completion state:
    // dismissing isn't the same as having gone through it.
    const dismissFab = useCallback(() => {
        setFabDismissed(true);
        localStorage.setItem(fabDismissedKeyFor(userIdRef.current), "1");
    }, []);

    const notifyAction = useCallback(
        (actionKind) => {
            setEffectiveSteps((currentEffective) => {
                setStepIndexState((prevIndex) => {
                    const currentStep = currentEffective[prevIndex];
                    if (isOpen && currentStep?.completesOn === actionKind) {
                        return Math.min(prevIndex + 1, currentEffective.length - 1);
                    }
                    return prevIndex;
                });
                return currentEffective;
            });
        },
        [isOpen]
    );

    const value = useMemo(
        () => ({
            isOpen,
            stepIndex,
            setStepIndex,
            completed,
            fabDismissed,
            existingCounts,
            effectiveSteps,
            start,
            close,
            finish,
            dismissFab,
            notifyAction,
        }),
        [isOpen, stepIndex, completed, fabDismissed, existingCounts, effectiveSteps, start, close, finish, dismissFab, notifyAction]
    );

    return <InventoryTourContext.Provider value={value}>{children}</InventoryTourContext.Provider>;
};

export const useInventoryTour = () => {
    const ctx = useContext(InventoryTourContext);
    if (!ctx) throw new Error("useInventoryTour must be used within InventoryTourProvider");
    return ctx;
};
