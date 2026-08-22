import { useEffect, useState } from "react";

// Animates a number from 0 to `target` with an ease-out cubic curve -
// originally local to ElectronicInvoices.jsx (the metric cards), extracted
// so other "premium stat" surfaces (e.g. LocationStockPanel's totals) can
// share the exact same easing/feel instead of re-implementing it slightly
// differently each time.
const useCountUp = (target, duration = 900) => {
    const [value, setValue] = useState(0);
    useEffect(() => {
        const from = 0;
        const to = Number(target) || 0;
        if (from === to) {
            setValue(to);
            return undefined;
        }
        let cancelled = false;
        let startTs = null;
        let frame = 0;
        const step = (ts) => {
            if (cancelled) return;
            if (startTs === null) startTs = ts;
            const progress = Math.min((ts - startTs) / duration, 1);
            const eased = 1 - Math.pow(1 - progress, 3);
            setValue(Math.round(from + (to - from) * eased));
            if (progress < 1) frame = requestAnimationFrame(step);
        };
        frame = requestAnimationFrame(step);
        return () => {
            cancelled = true;
            if (frame) cancelAnimationFrame(frame);
        };
    }, [target, duration]);
    return value;
};

export default useCountUp;
