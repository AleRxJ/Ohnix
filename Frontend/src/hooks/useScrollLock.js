import { useEffect } from "react";

// Plain `document.body.style.overflow = "hidden"` (what both mobile menus
// used before this) does NOT reliably block background scroll on iOS
// Safari when the user drags directly on the page - overflow:hidden on body
// stops the *body* from scrolling, but iOS still lets touch-driven rubber-
// band scrolling move the visual viewport underneath a fixed-position
// overlay. Pinning body to `position: fixed` (and restoring the exact
// scroll offset on unlock) is the standard workaround that actually holds
// on iOS as well as Android/desktop.
export default function useScrollLock(active) {
    useEffect(() => {
        if (!active) return;
        const scrollY = window.scrollY;
        const body = document.body;
        const prev = {
            position: body.style.position,
            top: body.style.top,
            left: body.style.left,
            right: body.style.right,
            width: body.style.width,
            overflow: body.style.overflow,
        };

        body.style.position = "fixed";
        body.style.top = `-${scrollY}px`;
        body.style.left = "0";
        body.style.right = "0";
        body.style.width = "100%";
        body.style.overflow = "hidden";

        return () => {
            body.style.position = prev.position;
            body.style.top = prev.top;
            body.style.left = prev.left;
            body.style.right = prev.right;
            body.style.width = prev.width;
            body.style.overflow = prev.overflow;
            window.scrollTo(0, scrollY);
        };
    }, [active]);
}
