// Build-time prerendering for marketing pages.
//
// The app is a pure CSR SPA (Vite + React, no SSR/SSG) - SeoHead.jsx sets
// title/description/OG tags via useEffect, so anything that doesn't execute
// JS (Facebook/WhatsApp/LinkedIn/Slack link previews, and Bing/slower
// crawlers) only ever sees the generic homepage markup from index.html for
// every route. This script runs after `vite build`, boots the built app in
// a local preview server, visits each indexable marketing route with a
// headless browser, and writes the fully-rendered HTML to its own
// dist/<route>/index.html - Vercel serves that static file directly for an
// exact path match (checked before the SPA catch-all rewrite in
// vercel.json), so crawlers and share-preview bots get real per-page
// content without any client-side JS. The app itself is unaffected: React
// still mounts with createRoot() on load and takes over normally.
//
// Only marketing/indexable routes are listed here - everything else
// (dashboard, billing, login, etc.) is blocked in robots.txt and was never
// meant to be indexed, so it doesn't need prerendering.

import { spawn } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Two Chromium paths, picked at runtime:
// - Local/dev (Windows/macOS/full Linux desktop): full `puppeteer`, which
//   bundles its own Chromium download that Just Works there.
// - Vercel's build container: that same bundled Chromium fails with
//   "error while loading shared libraries: libnspr4.so" - it's built for a
//   full desktop Linux, not Vercel's minimal build image. @sparticuz/chromium
//   ships a Chromium built specifically for serverless/minimal-Linux
//   environments (no missing shared libs), used via puppeteer-core.
const isServerless = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);

const launchBrowser = async () => {
    if (isServerless) {
        const [{ default: chromium }, { default: puppeteerCore }] = await Promise.all([
            import("@sparticuz/chromium"),
            import("puppeteer-core"),
        ]);
        return puppeteerCore.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: true,
        });
    }

    const { default: puppeteer } = await import("puppeteer");
    return puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, "..");
const distDir = join(rootDir, "dist");
const PORT = 4173;
const HOST = `http://localhost:${PORT}`;

import { MARKETING_ROUTES as ROUTES } from "./seo-routes.js";

const waitForServer = async (url, attempts = 60) => {
    for (let i = 0; i < attempts; i += 1) {
        try {
            const res = await fetch(url);
            if (res.ok) return;
        } catch {
            // Server not up yet - keep polling.
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Preview server at ${url} never became ready`);
};

const run = async () => {
    // Preserve Vite's clean SPA document before the homepage prerender replaces
    // dist/index.html. Private/deep routes are rewritten to this file in
    // Vercel, so they never inherit the marketing page's HTML or CSS.
    copyFileSync(join(distDir, "index.html"), join(distDir, "app.html"));

    console.log("[prerender] Starting vite preview server...");
    const viteCli = join(rootDir, "node_modules", "vite", "bin", "vite.js");
    const server = spawn(process.execPath, [viteCli, "preview", "--port", String(PORT), "--strictPort"], {
        cwd: rootDir,
        stdio: "inherit",
        shell: false,
    });

    let browser;
    try {
        await waitForServer(HOST);

        browser = await launchBrowser();
        const renderedPages = new Map();

        for (const route of ROUTES) {
            const page = await browser.newPage();
            const url = `${HOST}${route}?ohnix-prerender=1`;
            console.log(`[prerender] Rendering ${route}`);
            await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
            // Give SeoHead's useEffect (title/meta/structured data) and any
            // lazy-loaded route chunk a beat to settle after network idle.
            await new Promise((resolve) => setTimeout(resolve, 300));
            await page.evaluate(() => {
                document.querySelector("#root").dataset.prerendered = "true";
                // Vite adds these while the build-time browser hydrates. Keeping
                // them in the saved HTML would make real visitors eagerly fetch
                // the 800+ KiB authenticated-app vendor graph again.
                document.querySelectorAll('link[rel="modulepreload"]').forEach((link) => link.remove());
            });
            const html = await page.content();
            await page.close();

            renderedPages.set(route, html);
        }

        // Keep dist/index.html unchanged while Chromium is still using it as
        // Vite's history fallback. Writing only after every route succeeds
        // prevents later routes from accidentally rendering the homepage.
        for (const [route, html] of renderedPages) {
            const outDir = route === "/" ? distDir : join(distDir, route);
            mkdirSync(outDir, { recursive: true });
            writeFileSync(join(outDir, "index.html"), html, "utf8");
        }

        console.log(`[prerender] Done - ${ROUTES.length} route(s) prerendered.`);
    } finally {
        if (browser) await browser.close();
        server.kill();
    }
};

run().catch((err) => {
    // Non-fatal: prerendering is an SEO/share-preview enhancement on top of
    // the CSR build `vite build` already produced above, not something the
    // app depends on to function. Build hosts (e.g. Vercel) don't always
    // have the system libraries Chromium needs, or the Chromium download
    // can fail/be skipped during `npm install` - if that happens here, fail
    // loudly in the log but let the deploy proceed with the plain SPA build
    // instead of blocking it entirely.
    console.error("[prerender] Failed - continuing without prerendered HTML:", err);
});
