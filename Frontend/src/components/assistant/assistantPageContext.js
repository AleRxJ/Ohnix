import { useEffect, useSyncExternalStore } from "react";

// Lets a page tell the assistant where inside it the user is (e.g. which
// Accounting tab is open) - the route alone only says "accounting", and
// most of that module's 20 tabs have nothing in common. A tiny external
// store rather than a React context so any page can publish to it without
// being wrapped in a provider; the widget reads it at send time and
// subscribes to it for the "you are here" line in its header.
let pageContext = {};
const listeners = new Set();

const setPageContext = (next) => {
    pageContext = next;
    listeners.forEach((listener) => listener());
};

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

export const getAssistantPageContext = () => pageContext;

// Re-renders the caller whenever a page publishes a new context.
export const useAssistantPageContextValue = () => useSyncExternalStore(subscribe, getAssistantPageContext);

// Registers `context` while the calling component is mounted and clears it
// on unmount, so leaving Accounting can't leave a stale tab behind for the
// next page's questions.
export const useAssistantPageContext = (context) => {
    const serialized = JSON.stringify(context);
    useEffect(() => {
        setPageContext(JSON.parse(serialized));
        return () => {
            setPageContext({});
        };
    }, [serialized]);
};

// Brings a control the assistant pointed at into view, pulses it, and pins
// a small "Aquí" callout to it - the pulse alone is easy to miss on a busy
// screen. The target is often not mounted yet (the widget just navigated to
// another route/tab), so this polls briefly instead of assuming it's there.
const SPOTLIGHT_CLASS = "assistant-spotlight";
const SPOTLIGHT_MS = 4500;
const FIND_TIMEOUT_MS = 4000;
const FIND_INTERVAL_MS = 150;
const CALLOUT_GAP = 10;

// Follows the target every frame while visible: the page (or an inner
// scroll container) keeps moving during the smooth scroll that brings the
// target into view, so a position computed once would be left behind.
const pinCallout = (target, label) => {
    const callout = document.createElement("div");
    callout.className = "assistant-spotlight-callout";
    callout.setAttribute("role", "status");
    callout.textContent = label;
    document.body.appendChild(callout);

    let frame = null;
    const follow = () => {
        const rect = target.getBoundingClientRect();
        const width = callout.offsetWidth;
        const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 8), window.innerWidth - width - 8);
        // Above the target when there's room, otherwise below it.
        const above = rect.top - callout.offsetHeight - CALLOUT_GAP;
        const top = above > 8 ? above : rect.bottom + CALLOUT_GAP;
        callout.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        callout.dataset.placement = above > 8 ? "above" : "below";
        frame = window.requestAnimationFrame(follow);
    };
    follow();

    window.setTimeout(() => {
        window.cancelAnimationFrame(frame);
        callout.remove();
    }, SPOTLIGHT_MS);
};

export const spotlightAnchor = (anchor, { label } = {}) =>
    new Promise((resolve) => {
        const startedAt = Date.now();
        const tryFind = () => {
            const element = document.querySelector(`[data-assistant-anchor="${CSS.escape(anchor)}"]`);
            // Tab headers render the label inside Ant's own clickable tab
            // node - pulse that node so the whole tab lights up, not just
            // the text span.
            const target = element?.closest(".ant-tabs-tab") || element;
            if (target && target.getClientRects().length > 0) {
                target.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
                target.classList.add(SPOTLIGHT_CLASS);
                window.setTimeout(() => target.classList.remove(SPOTLIGHT_CLASS), SPOTLIGHT_MS);
                if (label) pinCallout(target, label);
                resolve(true);
                return;
            }
            if (Date.now() - startedAt > FIND_TIMEOUT_MS) {
                resolve(false);
                return;
            }
            window.setTimeout(tryFind, FIND_INTERVAL_MS);
        };
        tryFind();
    });
