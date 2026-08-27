import { useEffect } from "react";

let activeLocks = 0;
let previousBodyStyles = null;

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
        const body = document.body;
        const scrollY = window.scrollY;

        if (activeLocks === 0) {
            previousBodyStyles = {
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
        }
        activeLocks += 1;

        return () => {
            activeLocks = Math.max(0, activeLocks - 1);
            if (activeLocks !== 0 || !previousBodyStyles) return;

            body.style.position = previousBodyStyles.position;
            body.style.top = previousBodyStyles.top;
            body.style.left = previousBodyStyles.left;
            body.style.right = previousBodyStyles.right;
            body.style.width = previousBodyStyles.width;
            body.style.overflow = previousBodyStyles.overflow;
            previousBodyStyles = null;
            window.scrollTo(0, scrollY);
        };
    }, [active]);
}
