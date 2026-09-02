// Vite's dynamic-import CSS loader resolves as soon as it sees a matching
// <link rel="stylesheet"> already in the document - it does NOT wait for
// that link to actually finish downloading and apply. Code that needs the
// styles genuinely in effect (not just requested) awaits this too, so it
// never paints a beat of unstyled content in between. Shared by main.jsx
// (first page load) and App.jsx's StyleBundleGate (client-side navigation
// into the other marketing/app CSS zone).
export const waitForStylesheets = () =>
    Promise.all(
        Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map((link) =>
            link.sheet
                ? null
                : new Promise((resolve) => {
                      link.addEventListener("load", resolve, { once: true });
                      link.addEventListener("error", resolve, { once: true });
                  })
        )
    );
