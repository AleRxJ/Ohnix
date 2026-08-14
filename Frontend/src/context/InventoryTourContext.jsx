import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import AuthContext from "./AuthContext";

const InventoryTourContext = createContext(null);

const storageKeyFor = (userId) => `ohnix.inventory_tour.completed.${userId || "anon"}`;

// User-triggered only (never auto-shown) - per spec this must not block
// normal use of the app, so completion is a soft localStorage flag, not a
// server-enforced gate. Scoped per userId so a shared browser doesn't leak
// one account's "seen it" state onto another.
export const InventoryTourProvider = ({ children }) => {
    const { user } = useContext(AuthContext);
    const userId = user?.id || user?._id || null;

    const [isOpen, setIsOpen] = useState(false);
    const [stepIndex, setStepIndex] = useState(0);
    const [completed, setCompleted] = useState(false);

    const userIdRef = useRef(userId);
    useEffect(() => {
        userIdRef.current = userId;
        setCompleted(localStorage.getItem(storageKeyFor(userId)) === "1");
    }, [userId]);

    const start = useCallback(() => {
        setStepIndex(0);
        setIsOpen(true);
    }, []);

    const close = useCallback(() => {
        setIsOpen(false);
    }, []);

    const finish = useCallback(() => {
        setIsOpen(false);
        setCompleted(true);
        localStorage.setItem(storageKeyFor(userIdRef.current), "1");
    }, []);

    const value = useMemo(
        () => ({ isOpen, stepIndex, setStepIndex, completed, start, close, finish }),
        [isOpen, stepIndex, completed, start, close, finish]
    );

    return <InventoryTourContext.Provider value={value}>{children}</InventoryTourContext.Provider>;
};

export const useInventoryTour = () => {
    const ctx = useContext(InventoryTourContext);
    if (!ctx) throw new Error("useInventoryTour must be used within InventoryTourProvider");
    return ctx;
};
