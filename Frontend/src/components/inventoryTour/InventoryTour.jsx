import React, { useEffect, useState } from "react";
import { Tour } from "antd";
import { useLocation, useNavigate } from "react-router-dom";
import useI18n from "../../hooks/useI18n";
import { useInventoryTour } from "../../context/InventoryTourContext";
import { INVENTORY_TOUR_STEPS } from "./inventoryTourSteps";

const POLL_INTERVAL_MS = 150;
const POLL_MAX_ATTEMPTS = 20; // ~3s, enough for a route change + data fetch

// Renders exactly one Tour step at a time instead of handing antd the full
// 10-step array, because most targets live on different routes (Products,
// Purchase, Orders) and simply don't exist in the DOM until we navigate
// there - a single-step Tour lets us drive navigation + element polling
// ourselves between steps, then hand off to antd only once the real target
// (or its absence) is confirmed.
const InventoryTour = () => {
    const { isOpen, stepIndex, setStepIndex, close, finish } = useInventoryTour();
    const { t } = useI18n();
    const navigate = useNavigate();
    const location = useLocation();
    // undefined = still resolving (render nothing, avoids a flash of the
    // wrong target mid-navigation); null = confirmed absent -> centered card.
    const [targetEl, setTargetEl] = useState(undefined);

    const step = INVENTORY_TOUR_STEPS[stepIndex];
    const totalSteps = INVENTORY_TOUR_STEPS.length;

    useEffect(() => {
        if (!isOpen || !step) return;
        if (step.path && location.pathname !== step.path) {
            navigate(step.path);
        }
    }, [isOpen, step, location.pathname, navigate]);

    useEffect(() => {
        if (!isOpen || !step) {
            setTargetEl(undefined);
            return;
        }
        if (!step.selector) {
            setTargetEl(null);
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

    if (!isOpen || !step || targetEl === undefined) return null;

    const isFirst = stepIndex === 0;
    const isLast = stepIndex === totalSteps - 1;

    return (
        <Tour
            open
            current={0}
            onClose={close}
            indicatorsRender={() => (
                <span className="text-xs text-[var(--ohnix-text-dim)]">
                    {stepIndex + 1} / {totalSteps}
                </span>
            )}
            steps={[
                {
                    title: t(step.titleKey),
                    description: t(step.descKey),
                    target: targetEl || null,
                    prevButtonProps: isFirst
                        ? undefined
                        : {
                              children: t("common.back"),
                              onClick: () => setStepIndex(stepIndex - 1),
                          },
                    nextButtonProps: {
                        children: isLast ? t("inventory_tour.finish") : t("common.next"),
                        onClick: () => {
                            if (isLast) {
                                finish();
                            } else {
                                setStepIndex(stepIndex + 1);
                            }
                        },
                    },
                },
            ]}
        />
    );
};

export default InventoryTour;
