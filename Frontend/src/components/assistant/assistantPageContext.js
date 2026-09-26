import { useEffect } from "react";

// Lets a page tell the assistant where inside it the user is (e.g. which
// Accounting tab is open) - the route alone only says "accounting", and
// most of that module's 20 tabs have nothing in common. A plain module-level
// value instead of a React context because the only reader (AssistantWidget)
// reads it at send time, not during render, so nothing needs to re-render
// when it changes.
let pageContext = {};

export const getAssistantPageContext = () => pageContext;

// Registers `context` while the calling component is mounted and clears it
// on unmount, so leaving Accounting can't leave a stale tab behind for the
// next page's questions.
export const useAssistantPageContext = (context) => {
    const serialized = JSON.stringify(context);
    useEffect(() => {
        pageContext = JSON.parse(serialized);
        return () => {
            pageContext = {};
        };
    }, [serialized]);
};

// Brings a control the assistant pointed at into view and pulses it. The
// target is often not mounted yet (the widget just navigated to another
// route/tab), so this polls briefly instead of assuming it's there.
const SPOTLIGHT_CLASS = "assistant-spotlight";
const SPOTLIGHT_MS = 4500;
const FIND_TIMEOUT_MS = 4000;
const FIND_INTERVAL_MS = 150;

export const spotlightAnchor = (anchor) =>
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
