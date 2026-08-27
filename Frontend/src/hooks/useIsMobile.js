import { useState, useEffect } from "react";

// Reactive viewport-width check via matchMedia - several components used to
// read `window.innerWidth` once at render time (ProductsTable.jsx,
// ProductDetailsDrawer.jsx, PageHeader.jsx), which never updates after a
// resize or orientation change (e.g. rotating a phone, or a desktop window
// being resized past the breakpoint) and left the table/drawer stuck in
// whichever layout happened to be true on first render.
export const BREAKPOINTS = {
    sm: 640,
    md: 768,
    lg: 1024,
    xl: 1280,
};

export default function useIsMobile(breakpoint = BREAKPOINTS.md) {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== "undefined" && window.innerWidth < breakpoint
    );

    useEffect(() => {
        const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
        const handleChange = (e) => setIsMobile(e.matches);
        handleChange(mql);
        if (mql.addEventListener) {
            mql.addEventListener("change", handleChange);
            return () => mql.removeEventListener("change", handleChange);
        }
        // Safari < 14 fallback
        mql.addListener(handleChange);
        return () => mql.removeListener(handleChange);
    }, [breakpoint]);

    return isMobile;
}
