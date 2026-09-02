import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// The service worker's navigation-fallback denylist (which routes must never
// get the SPA shell as a fallback) now lives in src/sw.js, since that's a
// real hand-written SW source file (injectManifest mode) rather than
// generated from this config - see NON_APP_NAVIGATION_PATTERNS there.

// Packages that MUST stay in the single vendor chunk.
// rc-util reads React.version at module init time (top-level code), so any
// chunk split between these packages causes TDZ / undefined errors in prod.
//
// CONFIRMED AGAIN on 2026-08-06: tried splitting antd into its own
// "vendor-antd" chunk (to keep it out of the marketing pages' bundle, since
// they don't use antd anymore) and verified with a real headless-browser
// load - both a marketing page AND /login threw
// "Cannot read properties of undefined (reading 'version')" on load,
// confirming this split is not safe with the current Rollup/Vite version
// no matter how the two chunks are ordered. Do not attempt this again
// without a real Rollup/Vite upgrade path and the same kind of real-browser
// verification (build succeeding is not enough - this crash only shows up
// at runtime, not at build time).
const REACT_ECOSYSTEM_PKGS = [
  '/react/',
  '/react-dom/',
  '/scheduler/',
  '/antd/',
  '/rc-',
  '/@rc-component/',
  '/@ant-design/',
]

// @antv/* packages also have circular class-inheritance dependencies at init time.
// @antv/g2 extends classes from @antv/g-lite; splitting them causes
// "Class extends value undefined is not a constructor or null".
const ANTV_PKGS = [
  '/@antv/',
  '/@ant-design/plots/',
]

/**
 * Build-time guard: fails the build if any React-ecosystem or @antv package
 * ends up in a chunk other than its designated vendor chunk.
 */
function chunkSafetyGuard() {
  return {
    name: 'chunk-safety-guard',
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue

        const isVendor      = /(?:^|\/)vendor[-.][^/]+\.js$/.test(fileName)
        const isChartsAntv  = /(?:^|\/)vendor-charts-antv[-.][^/]+\.js$/.test(fileName)

        for (const moduleId of Object.keys(chunk.modules ?? {})) {
          if (!moduleId.includes('node_modules')) continue

          const reactOffender = REACT_ECOSYSTEM_PKGS.find(pkg => moduleId.includes(pkg))
          if (reactOffender && !isVendor) {
            this.error(
              `[chunk-safety-guard] "${reactOffender.trim()}" leaked into "${fileName}".\n` +
              `React-ecosystem packages must stay in the "vendor" chunk.\n` +
              `Fix: do not add manualChunks rules for React, antd, rc-*, or @ant-design/*.`
            )
          }

          const antvOffender = ANTV_PKGS.find(pkg => moduleId.includes(pkg))
          if (antvOffender && !isChartsAntv && !isVendor) {
            this.error(
              `[chunk-safety-guard] "${antvOffender.trim()}" leaked into "${fileName}".\n` +
              `@antv/* packages must stay in the "vendor-charts-antv" chunk.\n` +
              `Fix: do not split @antv/* or @ant-design/plots across separate chunks.`
            )
          }
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    chunkSafetyGuard(),
    VitePWA({
      // The app registers the SW itself (see DashboardLayout.jsx) via the
      // virtual:pwa-register module, instead of an auto-injected <script>
      // tag - keeps registration confined to the authenticated app shell,
      // the only surface that needs offline support.
      injectRegister: false,
      registerType: 'autoUpdate',
      // Icons/name/theme already come from public/site-v2.webmanifest,
      // linked in index.html - don't generate or inject a second manifest.
      manifest: false,
      // injectManifest (not the default generateSW) so src/sw.js can add a
      // custom cacheWillUpdate plugin that rejects a precache entry whose
      // response Content-Type doesn't match its file extension. Without
      // that, workbox's default precache check only looks at HTTP status -
      // a 200 response with the wrong body (e.g. the SPA's HTML served for
      // a missing hashed asset, which is exactly what the vercel.json
      // catch-all rewrite used to do before it excluded /assets/*) gets
      // cached as if it were real CSS/JS and is served to every future
      // visitor forever, with no error and no way to self-heal. See
      // src/sw.js for the actual guard (the previous generateSW mode's
      // navigateFallback/denylist for offline navigation was dropped there,
      // not reproduced - see the comment in src/sw.js for why).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        // Vendor chunks (antd/antv/recharts) can be a few MB - the default
        // 2MB precache cap would silently skip them, breaking offline app
        // boot.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
        // Never precache the prerendered marketing HTML (dist/index.html,
        // dist/precios/index.html, etc.) - it's rebuilt on every deploy, and
        // this app deploys many times a day. A stale cached copy of "/" left
        // over from an earlier deploy gets hydrated against the CURRENT JS
        // bundle and mismatches (React errors #418/#423), which throws away
        // the whole tree and forces a client-side re-render - and since
        // navigating on from there (e.g. to /login) stays inside that same
        // already-broken page instance, the visible breakage outlives the
        // homepage visit. Precaching it was also pointless: the SW only
        // registers once a visitor reaches the authenticated dashboard (see
        // DashboardLayout.jsx), so a marketing-only visitor never has it
        // installed anyway. app.html (the actual authenticated app shell)
        // isn't named index.html, so it's unaffected by this exclusion.
        globIgnores: ['**/node_modules/**/*', '**/index.html'],
      },
    }),
  ],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Strategy: one "vendor" chunk for all node_modules (except heavy chart libs).
    //
    // Why: every lazy-loaded page imports antd components. When Vite auto-splits
    // shared antd internals into micro-chunks (Table, EllipsisOutlined, rc-util…)
    // Rollup cannot reorder the circular imports across chunk boundaries at runtime,
    // producing TDZ errors ("Cannot access 'X' before initialization") or
    // "Cannot read properties of undefined ('version' / 'createContext')".
    //
    // Putting all React-ecosystem packages in a single chunk guarantees they
    // initialise together in the correct order. Page chunks (from React.lazy)
    // remain split — only node_modules are consolidated.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // @antv/* and @ant-design/plots ALL go into one chunk.
          // @antv/g2 extends classes from @antv/g-lite at module init time;
          // splitting them causes "Class extends value undefined" in prod.
          if (
            id.includes('/@antv/') ||
            id.includes('/@ant-design/plots/')
          ) return 'vendor-charts-antv'

          if (
            id.includes('/recharts/') ||
            id.includes('/d3-') ||
            id.includes('/victory-vendor/')
          ) return 'vendor-charts-recharts'

          // Everything else (React, antd, rc-*, icons, router, i18n, utils…)
          // lives in a single chunk so circular imports resolve correctly.
          return 'vendor'
        },
      },
    },
  },
})
