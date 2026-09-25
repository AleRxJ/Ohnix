// Frontend/src/utils/epaycoTokenizer.js
//
// ePayco card tokenization (checkout.epayco.co/epayco.min.js) - the card
// goes straight from the browser to ePayco; only the opaque token id ever
// reaches Ohnix's backend. A DIFFERENT library from the on-page checkout
// widget (checkout.js) used by EpaycoCheckout.jsx. ePayco.token.create
// expects a jQuery-wrapped <form> whose inputs carry data-epayco="card[...]"
// attributes, so jQuery is loaded from a CDN on demand rather than bundled.
//
// Shared by EnrollApiBilling.jsx (external API clients) and
// EpaycoCardForm.jsx (Ohnix plan checkout / "cambiar tarjeta").

const JQUERY_SCRIPT_URL = "https://code.jquery.com/jquery-3.7.1.min.js";
const JQUERY_SCRIPT_ID = "jquery-cdn-script";
const EPAYCO_TOKEN_SCRIPT_URL = "https://checkout.epayco.co/epayco.min.js";
const EPAYCO_TOKEN_SCRIPT_ID = "epayco-tokenize-script";

export const loadScriptOnce = (id, src) =>
    new Promise((resolve, reject) => {
        const existing = document.getElementById(id);
        if (existing) {
            if (existing.dataset.loaded === "true") resolve();
            else existing.addEventListener("load", () => resolve());
            return;
        }
        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.async = true;
        script.onload = () => {
            script.dataset.loaded = "true";
            resolve();
        };
        script.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.head.appendChild(script);
    });

// Resolves with the ePayco token id for the card fields inside `formElement`.
// `messages` supplies the (already translated) error strings.
export const tokenizeEpaycoCard = async ({ formElement, publicKey, messages = {} }) => {
    await loadScriptOnce(JQUERY_SCRIPT_ID, JQUERY_SCRIPT_URL);
    await loadScriptOnce(EPAYCO_TOKEN_SCRIPT_ID, EPAYCO_TOKEN_SCRIPT_URL);

    if (!publicKey) throw new Error(messages.missingPublicKey || "Missing ePayco public key");
    if (!window.jQuery || !window.ePayco) throw new Error(messages.scriptError || "ePayco could not be loaded");

    window.ePayco.setPublicKey(publicKey);
    const $form = window.jQuery(formElement);

    return new Promise((resolve, reject) => {
        window.ePayco.token.create($form, (err, tokenResult) => {
            if (err) {
                reject(new Error(err?.message || err?.[0]?.codError || messages.cardError || "Card error"));
                return;
            }
            const id = tokenResult?.id || tokenResult?.token?.id || tokenResult;
            if (!id || typeof id !== "string") {
                reject(new Error(messages.cardError || "Card error"));
                return;
            }
            resolve(id);
        });
    });
};

// Display-only brand detection from the number prefix - only the brand and
// last 4 digits are ever sent to the backend, never the number itself.
export const detectCardBrand = (number) => {
    const n = `${number || ""}`.replace(/\D/g, "");
    if (/^4/.test(n)) return "visa";
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(n)) return "mastercard";
    if (/^3[47]/.test(n)) return "amex";
    if (/^3(0[0-5]|[68])/.test(n)) return "diners";
    if (/^(6011|65|64[4-9])/.test(n)) return "discover";
    return "card";
};
