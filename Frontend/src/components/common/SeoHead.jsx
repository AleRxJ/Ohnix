import { useEffect } from "react";

const SITE_URL = "https://www.ohnix.co";
const DEFAULT_IMAGE = `${SITE_URL}/Ohnix_FullLogo.png`;

const upsertMeta = (selector, attributes) => {
    let element = document.head.querySelector(selector);
    if (!element) {
        element = document.createElement("meta");
        document.head.appendChild(element);
    }

    Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            element.setAttribute(key, value);
        }
    });
};

const upsertLink = (selector, attributes) => {
    let element = document.head.querySelector(selector);
    if (!element) {
        element = document.createElement("link");
        document.head.appendChild(element);
    }

    Object.entries(attributes).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            element.setAttribute(key, value);
        }
    });
};

const setStructuredData = (payload) => {
    const scriptId = "ohnix-structured-data";
    let script = document.getElementById(scriptId);

    if (!script) {
        script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = scriptId;
        document.head.appendChild(script);
    }

    script.textContent = JSON.stringify(payload);
};

const clearStructuredData = () => {
    const script = document.getElementById("ohnix-structured-data");
    if (script) {
        script.remove();
    }
};

const SeoHead = ({
    title,
    description,
    canonicalPath = "/",
    image = DEFAULT_IMAGE,
    lang = "es",
    noIndex = false,
    structuredData,
}) => {
    useEffect(() => {
        const canonicalUrl = `${SITE_URL}${canonicalPath}`;
        const robotsValue = noIndex ? "noindex, nofollow" : "index, follow";

        document.title = title;
        document.documentElement.lang = lang;

        upsertMeta('meta[name="description"]', {
            name: "description",
            content: description,
        });

        upsertMeta('meta[name="robots"]', {
            name: "robots",
            content: robotsValue,
        });

        upsertMeta('meta[property="og:type"]', {
            property: "og:type",
            content: "website",
        });

        upsertMeta('meta[property="og:title"]', {
            property: "og:title",
            content: title,
        });

        upsertMeta('meta[property="og:description"]', {
            property: "og:description",
            content: description,
        });

        upsertMeta('meta[property="og:url"]', {
            property: "og:url",
            content: canonicalUrl,
        });

        upsertMeta('meta[property="og:image"]', {
            property: "og:image",
            content: image,
        });

        upsertMeta('meta[name="twitter:card"]', {
            name: "twitter:card",
            content: "summary_large_image",
        });

        upsertMeta('meta[name="twitter:title"]', {
            name: "twitter:title",
            content: title,
        });

        upsertMeta('meta[name="twitter:description"]', {
            name: "twitter:description",
            content: description,
        });

        upsertMeta('meta[name="twitter:image"]', {
            name: "twitter:image",
            content: image,
        });

        upsertLink('link[rel="canonical"]', {
            rel: "canonical",
            href: canonicalUrl,
        });

        upsertLink('link[rel="alternate"][hreflang="es"]', {
            rel: "alternate",
            hreflang: "es",
            href: canonicalUrl,
        });

        upsertLink('link[rel="alternate"][hreflang="en"]', {
            rel: "alternate",
            hreflang: "en",
            href: canonicalUrl,
        });

        if (structuredData) {
            setStructuredData(structuredData);
        } else {
            clearStructuredData();
        }
    }, [title, description, canonicalPath, image, lang, noIndex, structuredData]);

    return null;
};

export default SeoHead;
