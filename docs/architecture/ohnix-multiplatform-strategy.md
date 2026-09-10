# Ohnix Multiplatform Strategy

Status: research/architecture proposal. No implementation has been done as part of this document. Continuation of the offline-first initiative (`OFFLINE_ARCHITECTURE.md`, plan at `.claude/plans/joyful-weaving-marshmallow.md`) — this document does not repeat that audit, it builds on its conclusions.

---

## 1. Executive Summary

Ohnix can become Web + Desktop + Mobile **without rewriting the product**, by treating the existing React app as the reusable core rather than a thing to replace:

- **Desktop (Windows/macOS/Linux): Tauri v2.** Wrap the existing React 18 + Vite + antd SPA close to as-is (~85-95% of frontend code untouched). Small (MB, not 100+MB), stronger default-deny security model than Electron. Real, but scoped, risk areas: Linux WebKitGTK rendering variance, and POS hardware (thermal printers/cash drawers) resting on unofficial community plugins.
- **Mobile (Android/iOS): React Native + Expo.** A genuinely new app, not a port — antd and react-router-dom don't come along, only business logic, validation, permissions, and the API contract do. Narrower feature scope than desktop by design (fast lookups, barcode scan, quick sale, notifications — not full back-office parity).
- **Offline + Sync: extend the existing custom system, do not adopt RxDB, PowerSync, or ElectricSQL.** All three are "sync-first" products; Ohnix's actual requirement is "business-rule integrity first, sync second" (server is sole authority over stock/money via real Postgres locks and `Serializable` transactions — never a client-side merge). Each off-the-shelf option would have to be fought into that shape and brings a new recurring cost, a new vendor dependency, or new production infrastructure (Postgres logical replication) that doesn't exist today. Ohnix's own outbox + idempotency + mirror system, already shipped and proven on web, is the better foundation — it needs two new storage adapters (Tauri/SQLite, Expo/SQLite), not a new architecture.
- **Real-time is already built.** Socket.IO + Redis adapter, account- and location-scoped rooms, a payload-free `data:changed` invalidation event that triggers a refetch — this is not a gap to fill, it's an asset to extend to Desktop and Mobile unchanged.
- **Backend stays Node + Express + Prisma + PostgreSQL/Neon.** Nothing here requires a new database or a new backend framework.
- **Monorepo: yes, but incrementally.** pnpm workspaces first (config-only change, zero deploy-pipeline disruption on Vercel/Render), Turborepo layered in once multi-toolchain rebuild pain appears (its remote cache is free), Nx only if/when enforced package boundaries are actually needed — not before.
- **One real open problem this document surfaces, not previously flagged**: Ohnix's backend enforces a **single session per user** (logging in on a new device disconnects the old one). That's correct for "someone else logged into my account" but is the wrong model for "the same owner has the POS desktop open at the store AND the phone in their pocket" — this needs a product decision before Desktop+Mobile ship simultaneously (see §29).

---

## 2. Current Architecture (verified against the real code, 2026-09-10)

### Frontend (`Frontend/`)
- React 18.3.1, Vite 6.1, antd 5.24 (+ `@ant-design/plots`, `@ant-design/icons`), react-router-dom 7.2 (`BrowserRouter`), axios 1.8, dayjs, i18next 26/react-i18next 17 (with `i18next-browser-languagedetector` + `i18next-http-backend`), recharts, socket.io-client 4.8, `html5-qrcode` for barcode scanning, `xlsx` for exports.
- **No TypeScript** anywhere in the app. No state-management library (Redux/Zustand/React Query) — every module is a hand-rolled hook (`useState`+`useEffect`+try/catch+toast).
- **Offline layer already shipped** (Etapas 0-5 of the prior initiative, see §3): Dexie 4.4 (IndexedDB) mirror tables, a persisted outbox with idempotency keys, a sync engine, `vite-plugin-pwa` (`injectManifest` strategy, custom `Frontend/src/sw.js`) for an installable app-shell.
- **Real-time layer already shipped**, independent of the offline work: `Frontend/src/live/socketClient.js` connects Socket.IO to the backend at `/api/v1/socket.io`; `useResourcePresence.js` and `useDataInvalidation.js` consume it for live presence/soft-locks and "this list may be stale, refetch" nudges.
- Auth token: JWT bearer stored in `localStorage` (`accessToken`), plus a cookie (`withCredentials: true`) — a **dual** auth mechanism today.

### Backend (`Backend/`)
- Node/Express 4 + Prisma 6 + PostgreSQL (hosted on **Neon**, serverless Postgres) — no repository layer, services call `prisma` directly. 70 Prisma models.
- Multi-tenancy: `accountId` scoping (a `TeamMember` remaps to the owner's `accountId`) + location scoping via `pointOfSaleId` (`middleware/pos.permissions.js`). **`PointOfSale` in this codebase means a physical store/branch location, not a cash register** — there is no dedicated checkout/till UI; the closest thing to "POS" is the **Orders** module.
- Auth: JWT (1-day access / 10-day refresh), `User.tokenVersion` for full revocation, and a **Redis-enforced single session per user** — logging in elsewhere disconnects the current session (`session:replaced` event). Permissions: `TeamRole` × `TeamRolePermission` (`none/view/edit/admin`) per module, enforced via `requireModulePermission`.
- **Idempotency infrastructure already exists and is load-bearing**: `IdempotencyKey` Prisma model (unique per `accountId`+`scope`+`key`) + `middleware/idempotency.middleware.js`, applied to ~30 mutation routes.
- **Inventory is a hybrid cache+ledger**, not event-sourcing: `StockMovement` (append-only ledger) + `ProductLocationStock.stock` (authoritative balance, mutated under real `SELECT...FOR UPDATE` locks) + `Product.stock` (aggregate cache). Money operations use Postgres `Serializable` transactions. **This is the non-negotiable constraint that shapes the entire sync strategy in this document**: the server is always the sole arbiter of stock and money, by design, with real database-level concurrency control — not a convention that a sync layer could safely second-guess.
- **Real-time layer**: `Backend/live/socketServer.js` (Socket.IO + `@socket.io/redis-adapter` for multi-instance fan-out) + `Backend/live/dataEvents.js`. Two room scopes: `account:<id>` (account-wide resources — categories, customers, products, team) and `pos:<accountId>:<pointOfSaleId>` (location-scoped — orders, purchases, stock movements). Emits a **payload-free** `data:changed {resource, action}` event; the client re-runs the fetch it already does on mount. This was built specifically because a 2026-08-20 concurrency audit found presence/locks were realtime but no actual data mutation ever reached other connected users — it closes exactly the gap §13 of this brief asks about, already in production.
- No queue engine (no Bull/Agenda) — `node-cron`/`setInterval` for background jobs. `WebhookDelivery` (fixed backoff `[1,5,30,120,360,1440]` min) is the existing durable-retry precedent the offline outbox already mirrors.
- DIAN e-invoicing is fire-and-forget (`.catch()`, no `await`) after order confirmation — already the "local effect vs. external effect" decoupling pattern that a sync layer needs.

### What did NOT exist before the offline-first initiative, and now does
No Service Worker, no PWA manifest that worked, no IndexedDB, no operation queue, no `navigator.onLine` handling anywhere in the app as of the start of that work. All of it now exists — see §3.

---

## 3. Previous Offline-First Architecture (recap, not a re-audit)

Fully implemented and shipped (web only), documented in `OFFLINE_ARCHITECTURE.md`. Load-bearing decisions this document inherits without re-litigating:

- **Local DB: Dexie (IndexedDB)**, chosen for multi-table local transactions and `dexie-react-hooks`' `useLiveQuery` reactivity, over PouchDB/localStorage.
- **Outbox**: every offline mutation becomes a row with `{entity, opType, request, idempotencyKey, status, attempts, remoteId, localTempId?}`. The idempotency key is generated **once at enqueue time** (`crypto.randomUUID()`) and reused on every retry — this is what lets the existing backend `idempotent(scope)` middleware recognize a replayed request as already-processed.
- **Mirror strategy**: full-mirror-replace for small catalogs (products, customers, suppliers, etc. — no `updatedSince` filter exists on these endpoints, and a full refetch is fast enough at SMB scale; incremental sync was **evaluated and deliberately deferred**, not missed), paginated write-through for large lists (`orders`).
- **Conflict states**: `PENDING → SYNCING → SYNCED`, plus `ERROR` (transient, auto-retried) and `CONFLICT` (deterministic 4xx business rejection, never auto-retried — requires the user to correct and resubmit). **The client never resolves a stock/money conflict itself; it only reports the server's authoritative outcome.**
- **Connectivity detection** doesn't trust `navigator.onLine` alone (a real production bug: it stayed "online" through a DNS failure on a VPN/multi-adapter setup) — a failed request with no `error.response` triggers an immediate reachability re-check.
- **Sync engine**: on confirmed reconnect, pulls all registered mirrors (each isolated in its own try/catch — one failing pull must never block the outbox drain, a real bug that was found and fixed) then drains the outbox in order.
- **Known, deliberately deferred gaps** (carried forward as open items for this multiplatform work, not new discoveries): no persisted auth/permission snapshot in Dexie (a session that expires while offline forces a login screen even though the session is still valid — this is now a nearly identical problem for React Native, see §15); no `navigateFallback` in the service worker yet (reload-while-offline loses the current tab); no automated test suite (all verification so far has been manual, live-browser testing); no dedicated conflict-resolution UI panel.

---

## 4. Multiplatform Requirements

Restated from the brief, kept short since §21-30 answer each concretely: a Desktop app for Windows/macOS/Linux aimed at back-office/POS-adjacent, always-on-a-computer users; a Mobile app for Android/iOS aimed at owners/employees managing the business away from a desk; offline where it makes sense per platform; all clients synchronized through the same backend; and no rewrite — this has to layer onto the real Ohnix codebase.

---

## 5. Desktop Strategy

**Recommendation: Tauri v2**, wrapping the existing Frontend app, not a new UI.

Rationale: the existing SPA (React + Vite + antd + react-router-dom) runs inside Tauri's OS-native webview essentially unchanged in dev (`npm run dev` still serves through Vite) and in production (the built static assets are embedded in the binary). This is not "similar to Electron" marketing — Tauri's own numbers and independent reports are consistent: 3-10MB typical bundles (Electron: 120-200MB) because it uses the OS's already-installed webview instead of bundling Chromium, and 50-75% lower RAM use is commonly (if approximately) reported. See §6 for the full evaluation and the concrete integration changes required (they are real, but small).

## 6. Tauri Evaluation

**Code reuse: ~85-95%.** What must change, concretely — not hypothetical:
- Vite's `base`/asset paths must resolve correctly at Tauri's production origin (`tauri://localhost` on macOS/Linux, `http://tauri.localhost` on Windows) — the most commonly reported real breakage ("works in dev, CSS doesn't load in the built app") is an asset-path issue, not a routing incompatibility. `react-router-dom`'s `BrowserRouter` itself works unmodified (confirmed by a Tauri maintainer).
- A `Content-Security-Policy` `connect-src` allowlist must be added in `tauri.conf.json` for the API domain and the Socket.IO host — Tauri auto-injects CSP nonces for bundled JS/CSS but you own the network-allowlist for your own API calls.
- **Keep Socket.IO on its default browser transport.** A real, reproduced bug exists when people route Socket.IO through Tauri's `@tauri-apps/plugin-websocket` (a listener-registration race drops the first message) — Ohnix's socket client (`Frontend/src/live/socketClient.js`) already uses plain `socket.io-client`, which runs as ordinary webview JS and needs no Tauri-side change beyond the CSP entry.
- antd's CSS-in-JS uses `:where()` low-specificity selectors; verify rendering on Linux's WebKitGTK specifically (a working `antd`+Tauri reference project exists, so this is a verification task, not an open question of feasibility).
- Dexie/IndexedDB **works unmodified** in Tauri's webview on all three desktop OSes today — no forced migration to a native SQLite store (that's a separate, optional decision, see §11).

**Platform maturity**: Desktop (Win/macOS/Linux) has been stable since Tauri 1.0 (2022); v2 stable (Oct 2024, current 2.11.x) added mobile targets but **mobile support is explicitly less mature** — irrelevant to Ohnix since Desktop is the goal here, not "Tauri for mobile too" (React Native is the mobile answer, §7-8).

**Security model — a real advantage over Electron**: Tauri v2's Capabilities/Permissions/Scopes system is **default-deny** — every native command (filesystem, printer, custom Rust function) is unreachable from the webview unless explicitly granted in a capability file, including your own custom commands. This is stricter than Electron, which has no equivalent first-class declarative sandbox (contextIsolation/preload scripts are opt-in patterns you wire yourself). The tradeoff is real, ongoing config overhead — every native feature you expose needs a capability + scope entry — proportional to how much native surface Ohnix's desktop app ends up using.

**Auto-updates**: the official `updater` plugin requires a signed release (private key as a CI secret, never a `.env` file) and a hosted `latest.json` manifest — self-hostable for $0 on GitHub Releases or S3. No built-in staged/percentage rollout; that would be built manually if wanted later.

**Packaging/signing**: NSIS/MSI (Windows), signed `.dmg` with mandatory notarization via `notarytool` (macOS — covered by the same $99/yr Apple Developer membership, no extra fee), deb/RPM/AppImage (Linux, no OS-level signing requirement). Windows signing cost is a real, non-trivial line item post-Feb-2026 CA policy changes (see §24) — **Azure Trusted Signing (~$10/mo) is the pragmatic pick** over a traditional EV cert (~$280-400+/yr), and note EV certs no longer grant an instant SmartScreen-reputation bypass (that behavior was removed industry-wide in 2024).

**Hardware for the Orders/POS-adjacent module** (detail in §17): barcode scanners are almost always HID keyboard-emulation devices and need **zero Tauri code** — they just type into whatever `<input>` has focus, exactly like the browser today. Thermal ESC/POS printers and cash drawers (drawers are triggered via the printer's ESC/POS pulse, not a separate device class) have **no official Tauri plugin** — community crates exist (`tauri-plugin-thermal-printer`, `tauri-plugin-escpos`) and Tauri's sidecar mechanism (bundling an external helper binary) is the fallback if none prove reliable enough. This is real, scoped integration work, not a blocker.

**Known risks, stated plainly**: WebKitGTK (Linux) is repeatedly described in Tauri's own community as lower-quality than WebView2/WKWebView — CSS animation glitches and `contenteditable` quirks are cited, real bugs, not FUD; debugging tools differ per OS (Windows gets Edge DevTools-quality tooling, Linux does not); the plugin ecosystem, while growing fast (~47 → 120+ plugins Jan 2025 → Apr 2026), is still smaller than Electron's decade-deep npm ecosystem. **No verifiable, named production POS/back-office product built on Tauri surfaced in this research** — Ohnix would be a relatively early adopter for this specific use case, which is a real (not fatal) reference-risk worth naming honestly rather than glossing over.

**Bottom line**: yes, wrap the existing React app with Tauri. Budget real (not zero) integration time for CSP/asset-path config, capability files, and the printer/cash-drawer hardware layer — but no UI rewrite.

---

## 7. Mobile Strategy

**Recommendation: React Native + Expo — as a genuinely separate app**, sharing business logic and the API contract, not sharing UI or navigation, and covering a **deliberately narrower feature set** than the desktop/web back-office (see §12 for why "port the desktop screens smaller" is the wrong model).

## 8. React Native + Expo Evaluation

**What's shareable, concretely, verified against Ohnix's actual dependencies:**
- Business-logic hooks that only call the API and hold state, validation functions, permission-check logic, and dayjs usage (pure JS, no browser API dependency) — all portable close to as-is.
- i18next **resource files** (`locales/en|es/common.json`) are directly reusable; the **binding** is not — `i18next-browser-languagedetector`/`i18next-http-backend` are browser-only and need RN equivalents (`expo-localization`, bundled JSON).
- axios works in RN but is not friction-free: RN's `fetch` doesn't implement `ReadableStream`, which has caused real regressions in axios's fetch-adapter path (tracked upstream) — pin versions and prefer the XHR adapter rather than assuming "it just works" indefinitely.

**What is NOT shareable, and this must be stated plainly**: **antd has no React Native equivalent** — it is a React-DOM library, full stop. **react-router-dom does not run on RN** — routing is Expo Router (file-based, recommended default in 2026 specifically because it derives deep-link config from the file tree instead of a manually-maintained linking map) or React Navigation underneath it. Every mobile screen is new UI code.

**TypeScript is not forced.** Expo's own guidance is explicit that plain JS remains fully viable; the SDK's own APIs ship `.d.ts` files for autocomplete even in a `.js` project. The friction is social, not technical — most current third-party RN library examples default to TS, so plain-JS adoption means manually stripping annotations from copied examples, not a blocked path.

**Local persistence — the one place Ohnix's shipped offline work needs real re-engineering, not reuse:** there is no way to run Dexie/IndexedDB on a device — IndexedDB doesn't exist there. RN's realistic options are `expo-sqlite` (official, simplest, in-SDK) or WatermelonDB (SQLite-backed via JSI, built specifically for RN, scales further). **The correct unit to share is not the storage engine, it's the sync-engine logic** — Ohnix's `outbox.js`/`syncEngine.js` state machine (idempotency-key generation, `PENDING/SYNCING/SYNCED/ERROR/CONFLICT` transitions, deterministic-vs-transient rejection handling, pull-then-drain orchestration) has almost no actual IndexedDB-specific surface today — the Dexie-coupled part is narrowly the mirror read/write calls. Extracting that logic behind a small storage-adapter interface (`get/put/bulkPut/clear/transaction`) and writing a SQLite adapter for RN (and, if desktop later needs it, Tauri) is real but bounded engineering work — see §16 for why this beats adopting an off-the-shelf sync product.

**Hardware and platform APIs**:
- **Push notifications**: Expo's push service is free with no per-notification cost (600/sec/project hard limit), abstracts both FCM and APNs behind one API — a Node/Express backend integrates by POSTing device tokens, no separate Firebase Admin SDK needed unless finer control is wanted later.
- **Barcode scanning**: `expo-camera`'s native scanner (ML Kit on Android, VisionKit/AVFoundation on iOS) or `react-native-vision-camera` (higher-performance, actively debated which is "better" — no ecosystem consensus, both are viable) should **outperform** the web's `html5-qrcode` (JS/WASM-decoded against a browser video stream, no hardware acceleration) — this is a genuine mobile advantage over the current web scanner, not a downgrade.
- **Bluetooth is the weakest link**: Expo has **no first-party Bluetooth API at all**. ESC/POS Bluetooth printer libraries exist as community packages of uneven maintenance quality, and — critically — **any Bluetooth library requires a custom EAS dev client from day one**, since Expo Go cannot load native modules outside the Expo SDK. If Ohnix wants a Bluetooth-connected receipt printer on mobile, plan the dev-client workflow from the start, not as a later "eject" surprise.
- **Biometric auth** (`expo-local-authentication`, Face ID/fingerprint) is mature and works in Expo Go — no comparable gap to Bluetooth.
- **OTA updates (EAS Update)**: ship JS/asset changes without a store review, but **cannot ship native code changes** — any native module or SDK bump needs a full binary resubmission. Apple's 2025-2026 enforcement pattern (several apps blocked/pulled in early 2026) specifically targets apps whose JS **generates and executes new code at runtime**, not ordinary JS-bundle content updates — Ohnix's use (shipping updated business logic/UI via a fixed bundle) sits clearly on the compliant side, but this boundary is worth stating explicitly in any internal policy, not assumed.
- **Auth token storage**: `expo-secure-store` (Keychain/Keystore-backed, genuinely hardware-protected) is the correct choice, never `AsyncStorage` (plain text, extractable without root via ADB backup). Because RN has no shared browser cookie jar, mobile auth is realistically **bearer-token-only** — which is actually a *simplification* relative to the web's current dual cookie+bearer pattern, not an added complication, provided the backend already accepts bearer-only requests (verify this against the actual middleware before relying on it).

**Costs**: Expo's free tier (15 Android + 15 iOS builds/month, OTA to 1,000 MAU, 100GB CDN) likely covers Ohnix's early rollout; the 1,000-MAU OTA ceiling — not build volume — is the more likely trigger to move to the $99/mo Production plan once mobile adoption grows across Ohnix's business customers' employees.

**Production gotchas circa 2025-2026**: the New Architecture (Fabric/TurboModules) is now default in Expo's managed workflow — an interop layer covers most legacy libraries, but roughly 1-in-7 popular packages are cited as not-yet-fully-compatible; low risk for Ohnix specifically since this would be a greenfield RN app with no legacy native code to migrate. Expect App Store review to reject on missing/incomplete demo credentials for a multi-tenant business app (need a persistent reviewer account) and on privacy-disclosure gaps — plan for both up front, not as a post-rejection scramble.

**Why mobile ≠ shrunk desktop**: current UX guidance is consistent that mobile is a distinct discipline (thumb reach, interrupted attention, intermittent connectivity), not a scaled port — the deciding factor is actual observed user behavior, not a blanket rule. See §12 for what this means concretely for Ohnix's module scope.

---

## 9. Shared Code Strategy

Not three independent apps. A **Shared Core** (business logic, API client, validation, permission checks, auth token-storage interface, sync-engine logic, i18n resource content) consumed by three thin platform shells:

```
packages/
├── api-client/      axios instance + interceptors, platform-swappable auth-storage adapter
├── sync-core/        outbox state machine, idempotency-key logic, conflict classification,
│                      pull/drain orchestration — storage-agnostic, adapter interface only
├── validation/       shared validators (already mostly pure JS today)
├── permissions/      hasPermission-style logic (UX-only mirror of server authority, as today)
├── i18n/              locale JSON resources (binding stays per-platform)
└── (later, TS)       types/ once a shared package actually needs static typing

apps/
├── web/               current Frontend/, React + Vite + antd + react-router-dom
├── desktop/           Tauri shell around the web app's build output (or a thin wrapper)
└── mobile/            React Native + Expo, new UI + Expo Router, consumes packages/*
```

Platform-specific storage adapters live inside `apps/*` or a small `packages/sync-core-<platform>` split (`dexie-adapter`, `tauri-sql-adapter` or reused Dexie, `expo-sqlite-adapter`) implementing the same `IMirrorStore`/`IOutboxStore` interface `sync-core` defines. This is the direct, concrete answer to "what do we share vs. rebuild": **logic and contracts are shared, storage engines and UI are not.**

---

## 10. Monorepo Evaluation

**Recommendation: pnpm workspaces now; add Turborepo when multi-toolchain rebuild pain shows up; only evaluate Nx if enforced package boundaries or codegen become an actual need.** This sequencing is the consistent recommendation across current sources for a small team doing an incremental migration, not a big-bang rewrite — matching Ohnix's own stated approach on the offline-first work.

- **pnpm workspaces (bare)**: minutes of setup, handles linking/dedup only, no build cache or task graph. Fine as the very first step with just two apps and zero shared packages. `pnpm` **Catalogs** (stable since pnpm 9.5) solve "keep React's version pinned identically across web/desktop/mobile-adjacent tooling" without needing an orchestrator at all.
- **+ Turborepo**: the more approachable of the two orchestrators, near-zero migration cost from bare workspaces, and genuinely toolchain-agnostic — it caches on file-hash + declared command inputs/outputs, so a Tauri `cargo build` or an EAS build task is just another cached `turbo.json` task, no special Rust/Expo plugin required (unlike Nx, where polyglot support is plugin-dependent). **Turborepo's remote cache is free on every tier since Dec 2024** (100GB/mo uploads on the free plan), removing what used to be the main cost objection.
- **+ Nx**: adds a dependency-graph visualizer, codegen, and *enforced* module boundaries (e.g., a lint rule blocking `apps/mobile` from importing `apps/desktop` directly) plus distributed CI task execution. Real value once the package count and team size grow past what informal discipline can enforce — Nx Cloud is free for small teams (50K monthly credits, free up to 5 contributors) but becomes a recurring per-contributor cost beyond that. Not a day-one requirement here.

**Migration path that never breaks the production pipeline** (Vercel for the Vite frontend, Render for the Node backend, per current deploys):
1. Add `pnpm-workspace.yaml` listing the existing `Frontend/`/`Backend/` folders (rename to `apps/web`/`apps/api` later if desired — a pure path move, no logic change). Set each hosting provider's **Root Directory** to the specific app folder (not the monorepo root — both Vercel's and Render's own docs warn that a repo-root Root Directory triggers a full rebuild on any unrelated commit), with an install/build command that `cd`s to the workspace root and runs `pnpm --filter <app> build`. This is a config change; the deploy target and pipeline shape don't change.
2. Layer in Turborepo for local dev speed once it's felt — doesn't require touching the deploy configs, since Vercel/Render invoke the filtered `pnpm` command directly.
3. Extract the first shared package (`packages/api-client` or `packages/sync-core`) only once a second real consumer exists (the Tauri or Expo app) — not speculatively.
4. Introduce TypeScript **only inside new shared packages** as they're created — `Frontend/`/`Backend/` can stay plain JS indefinitely; pnpm workspaces are file-type agnostic and this coexistence is natively supported, not a special mode.

---

## 11. Local Database Strategy

| Platform | Store | Why |
|---|---|---|
| Web | **Dexie/IndexedDB** (unchanged) | Already built, shipped, proven in production. No reason to touch it. |
| Desktop (Tauri) | **Dexie/IndexedDB initially** (works unmodified in Tauri's webview on all three OSes) | Ships fastest, zero rewrite of the already-working mirror/outbox code. Revisit `tauri-plugin-sql` (SQLite, official, full desktop+mobile support) only if/when the shared-adapter work for React Native makes a second SQLite adapter "free" to reuse on desktop too, or if relational query needs (joins across orders/line-items for reporting) genuinely outgrow Dexie's object-store model. |
| Mobile (React Native) | **SQLite** (`expo-sqlite`, official/in-SDK; WatermelonDB if scale/query needs grow) | No IndexedDB exists on-device — not a choice, a hard constraint. |

A library like RxDB or PowerSync claiming to "abstract this away" was evaluated in §13-16 and rejected as the abstraction layer — not because a storage-agnostic layer is a bad idea (it's exactly what §9's `sync-core` does), but because those specific products bundle a full sync protocol/vendor relationship you'd have to adopt wholesale just to get the storage abstraction.

---

## 12. Sync Architecture

The existing custom pipeline — Dexie/SQLite mirror → outbox (idempotency key at enqueue) → sync engine (pull mirrors, drain outbox) → server-authoritative conflict resolution — is **extended**, not replaced, across platforms:

```
                              Neon PostgreSQL
                    (Prisma, real locks, Serializable txns —
                     sole authority over stock & money, unchanged)
                                    │
                         Node/Express API + Socket.IO
                      (idempotency middleware, account/POS-
                       scoped rooms, data:changed events)
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
           🌐 WEB               🖥️ DESKTOP             📱 MOBILE
       React + Vite            Tauri (webview           React Native
       (as today)              wraps the same           + Expo (new UI,
                                React app)                narrower scope)
              │                     │                     │
        Dexie/IndexedDB       Dexie/IndexedDB         SQLite
        (existing)            (initially; SQLite            (expo-sqlite)
                               later if justified)
              │                     │                     │
              └─────────────────────┼─────────────────────┘
                                     │
                    packages/sync-core (shared logic:
              outbox state machine, idempotency-key handling,
             conflict classification, pull/drain orchestration)
             — storage access only through a small adapter
               interface, one adapter implementation per
                          platform's local DB
```

This differs from the brief's reference diagram in one important way: **the arrows into "Local DB" are not identical technology per platform** (Dexie vs. eventually-maybe-SQLite on desktop, SQLite on mobile) — what's actually shared and identical across all three is the `sync-core` logic sitting above the storage layer, plus the wire protocol/endpoints on the server side. Sync is not a single box in this diagram; it's a shared behavior implemented against three storage adapters.

## 13. RxDB Evaluation

Technically the best "bolt onto our existing Prisma/Postgres API with no new server" fit of the three off-the-shelf options — its replication protocol is explicitly designed to sync against *any* backend (three functions your Express API implements: `pullHandler`, `pushHandler`, `pullStream$`), no dedicated RxDB server required. Rejected anyway because: **the free tier is web-only in practice.** React Native has no IndexedDB, so production-grade RN storage requires RxDB's **paid** SQLite storage plugin, and cross-platform desktop+mobile production use lands at **Pro Plus, $239/month, indefinitely** — a recurring vendor cost with no ceiling, for a capability (a storage adapter) Ohnix can build once and own. Its default conflict-resolution model is also client-merge-oriented and would need deliberate per-collection configuration to force "server always wins" — achievable, but one more thing to get right against a single vendor's evolving product, not a natural fit out of the box.

## 14. PowerSync Evaluation

The most architecturally sympathetic of the three: Sync Streams map naturally onto Ohnix's existing `accountId`/`pointOfSaleId` scoping, and its write path (client-side upload queue draining into developer-defined backend endpoints, with the backend able to reject a write outright for business reasons — their own docs use "reject an edit to a completed order" as the canonical example) is a genuinely good match for "server rejects, client never merges." Rejected for now because it requires **real new production infrastructure that doesn't exist today**: Postgres logical replication on Neon specifically, which auto-expires inactive replication slots after ~40 hours and can accumulate WAL (risking primary write blocking) if the consumer stalls — a new operational failure mode with no equivalent today. Add to that: FSL licensing (source-available with a non-compete clause, not fully open — low practical risk for a vertical SaaS like Ohnix, but real vendor exposure), and the fact that its **Tauri/Rust SDK is alpha** (explicitly built to replace an earlier, buggier web-SDK-in-a-webview approach) — promising, not yet production-safe on a real timeline. Self-hosting (free, Apache-licensed core service) avoids the cloud fees but not the new operational surface.

## 15. ElectricSQL Evaluation

Rejected outright, for reasons beyond "not needed yet": Electric is **read-path sync only by explicit design** — it never touches writes, so it wouldn't replace or reduce Ohnix's outbox/idempotency system at all, only potentially the mirror-refetch half. More importantly, **the company has pivoted**: as of 2026 it has rebranded around being "an agent platform built on sync" (Electric Agents/Streams/Sync tiers) and is "joining Neon at Databricks" — notable since Ohnix's own Postgres already sits on Neon, but this is a company visibly reprioritizing toward AI-agent infrastructure, with real roadmap uncertainty for the plain "sync my CRUD app" use case. Concretely disqualifying today: **React Native support for its local store (PGlite) is an open, unresolved GitHub issue**, and its only Tauri integration is an unproductionized 2024 tech demo. Not a credible cross-platform answer for Ohnix right now.

## 16. Custom Sync Evaluation

**This is the recommended path.** Ohnix's outbox state machine, idempotency-key generation/replay, deterministic-vs-transient conflict classification, and pull-then-drain orchestration are already storage-agnostic in substance — the only Dexie-coupled surface is the mirror read/write calls themselves (bulk upserts, full-table replace, transactions), which have a close semantic equivalent in SQLite (also transactional, also supports bulk writes). Extracting this into `packages/sync-core` behind a small adapter interface and writing two new storage adapters (Tauri, Expo/SQLite) is bounded, well-understood engineering work against code Ohnix has already proven correct in production — not a bet on an external vendor's pricing, license, or roadmap, all three of which have shifted materially in the last 18 months across the three alternatives evaluated above. It also requires **zero new backend infrastructure** — no logical replication to stand up and monitor on Neon, no new service, no new failure mode. The Socket.IO `data:changed` real-time layer (§18) and the server's idempotency/locking model need no changes either way.

**Comparative bottom line** (full table of dimensions in the research backing this document): none of RxDB/PowerSync/ElectricSQL were built around "sync is secondary to server-enforced business-rule integrity" — each can be configured to respect it, none was designed for it. Ohnix's own system already was.

---

## 17. POS Architecture

For the Orders module (Ohnix's de-facto POS) on Desktop: **Tauri + (Dexie initially, SQLite optionally later) + the extended custom sync engine**, not a different stack — this was the implicit question in §11 of the brief ("do we need Tauri+SQLite+Sync or something else") and the answer is "the same Tauri app already proposed, with the storage decision deferred per §11."

Hardware, concretely:
- **Barcode scanners**: the overwhelming majority in commercial use are HID keyboard-wedge devices — no Tauri code needed at all, they type into the focused input exactly as in the browser today. A raw-serial/USB-CDC scanner (less common) would use the community `tauri-plugin-serialplugin`.
- **Thermal receipt printers + cash drawers**: no official plugin exists; community crates (`tauri-plugin-thermal-printer`, `tauri-plugin-escpos`) cover USB/Bluetooth/TCP ESC/POS printers and explicitly support the drawer-open pulse (drawers are triggered through the printer, not a separate integration). Vet a specific crate against the actual printer model(s) Ohnix's customers use before committing, and keep Tauri's **sidecar** mechanism (bundling an external helper binary) as the fallback if a vendor only ships an SDK in another language.
- **Screens/keyboard/mouse/USB generally**: standard OS-level input, nothing Tauri-specific.
- **Offline operation and recovery**: identical to the already-proven web behavior — outbox-and-replay, server remains sole authority on stock/money, `CONFLICT` state surfaces business rejections for manual correction.
- **Updates**: Tauri's signed updater, self-hosted `latest.json`, no forced downtime.

Flag honestly: no verified, named production POS built on Tauri surfaced in research — this is a legitimate reference-risk (not a technical blocker) worth a small, deliberate pilot (one store, one printer model) before wider rollout.

## 18. Real-Time Synchronization

**Already built, already answers this section's question.** A Mobile user editing a product today already triggers `emitAccountEvent(accountId, "products")`, which reaches every other connected socket in that account's room; a Desktop tab open on the Products list is already wired (via `useDataInvalidation.js`) to refetch on that event. Extending this to Desktop (Tauri, keeping Socket.IO on its default browser transport per §6) and Mobile (`socket.io-client` in React Native — works with the standard WebSocket transport, needs verification against Ohnix's exact usage but no structural blocker found) requires **no backend change** — the same rooms, the same payload-free `data:changed` event, the same "your list may be stale, refetch" model already validated in production. This is deliberately not a pushed-payload/CRDT stream (the team's own 2026-08-20 audit chose invalidate-and-refetch specifically to avoid keeping a pushed payload's shape in sync with the REST response's) — that reasoning holds identically across three clients, not just two.

Where this composes with offline: a client that's currently offline simply won't receive the socket event (no connection) — on reconnect, the existing `subscribeSyncCompleted` pattern already handles "refresh after the real state is known," so no new mechanism is needed there either. The realtime nudge and the offline sync engine were already designed not to race each other (§4.4 of `OFFLINE_ARCHITECTURE.md`) — that discipline extends unchanged.

## 19. Authentication

- **Web**: unchanged — cookie + bearer dual mechanism as today.
- **Desktop (Tauri webview)**: can keep the exact same cookie+bearer pattern the web app uses today (Tauri's webview supports cookies), which is the simplest option and requires no auth-code fork; storing the bearer token via an OS keychain-backed mechanism (e.g., a Rust `keyring`/Stronghold-backed command) instead of webview `localStorage` is a worthwhile hardening step given a desktop machine's different physical-theft threat model (see §20), but not a functional requirement to ship.
- **Mobile (React Native)**: bearer-only via `expo-secure-store` (Keychain/Keystore) — RN has no shared cookie jar, so the cookie half of the current web pattern simply doesn't apply. This is a **simplification**, not new complexity, conditional on confirming the backend already accepts bearer-only requests (check before relying on it).
- **Company/branch/role scoping**: unchanged everywhere — the server remains the sole authority (`requireModulePermission`, `pos.permissions.js`); each platform's local `hasPermission`-style check stays a UX convenience mirroring what the server already enforces, exactly as documented for the web app today.
- **Offline session validity**: the known, previously-deferred gap (a session that expires while offline forces a login screen even though it's still valid) becomes **more** pressing with a mobile app that's routinely closed for days — carrying it forward as a priority item rather than a nice-to-have (see §26 roadmap, §29 open questions).
- **The single-session-per-user model is the one place this document disagrees with shipping Desktop+Mobile unchanged** — see §29.

## 20. Security

| Platform | Token storage | Rationale |
|---|---|---|
| Web | `localStorage` (as today) | Unchanged; a known, accepted tradeoff already in production. |
| Desktop | Webview storage today; OS keychain-backed storage as a hardening step | A desktop machine (especially a shared store terminal) has a different physical-access threat model than a personal phone — worth the extra step, not launch-blocking. |
| Mobile | `expo-secure-store` (Keychain/Keystore) | Hardware-backed; `AsyncStorage` must never hold a token (plaintext, extractable without root). |
| Offline data (all platforms) | Local mirror scoped and cleared per account on login-change/logout, as already implemented for web | Extend the existing `resetOfflineDataIfAccountChanged`/`clearOfflineDataOnLogout` pattern unchanged to the new storage adapters — this is adapter-interface work, not new security design. No card data is ever captured or stored locally on any platform, unchanged from today. |

Nothing here proposes new security architecture — it's the existing web design (own the risk explicitly, scope and clear local data per account, never persist more than the already-authorized read surface) applied through the same adapter interface to two more storage engines.

## 21. Versioning

Three concrete precedents combine into one recommended approach, rather than inventing one from scratch:

1. **Stripe-style pinned, additive-only API versions**: a version identifier attached per account/client, changeable only explicitly (never silently upgraded server-side); the backend's `packages/api-client` consumer can carry this as a header, with the server maintaining a compatibility-transform layer for older pinned clients rather than branching business logic by version.
2. **Plane's minimum-supported-client-version gate** (a real, published precedent closely matching Ohnix's shape — one mobile app across multiple deployment contexts): the client reports its version on connect; the server enforces a hard floor (below it, blocked entirely with an explicit upgrade prompt) and, above the floor, individual features can declare their own minimum-version requirement in a central registry rather than scattered ad hoc checks.
3. **Tolerant-reader + parallel-change discipline** (the standard mobile-engineering answer to "the app hasn't been opened in three weeks and the server changed"): the mobile binary is the one component that can't be rolled back once deployed, so all backend evolution must be additive-only by default, and any genuinely breaking sync-protocol change must be served in parallel (old and new shape simultaneously) until telemetry shows no client is still requesting the old one. Ohnix's `sync-core` payloads should be built to silently ignore unrecognized fields from day one, not added later as a patch.

Concretely for Ohnix: add a client-version header to `api-client`, a lightweight version-gate middleware on the backend (426 Upgrade Required below a configured floor per platform), and treat any change to the outbox/mirror wire format as a parallel-change migration, never a hard cutover.

## 22. Updates

- **Web**: unchanged, Vercel deploy on push.
- **Desktop**: Tauri's signed updater plugin, `latest.json` on GitHub Releases or S3 (free), checked on launch; no store review in the loop at all.
- **Mobile**: EAS Update for JS/asset-only changes (fast, no review), full binary resubmission via App Store/Play Store for any native change — budget for review turnaround that has measurably lengthened in 2026 (commonly 2-5 days for new submissions, longer at peak, plus a full additional cycle on any rejection) when planning release dates, not treating it as instant.
- **Cross-platform incompatibility guard**: the version gate from §21 is what actually prevents an old Desktop build and a new Mobile build from silently disagreeing about the sync protocol — updates and versioning are one mechanism, not two.

## 23. Scalability

Ohnix's current stack (Postgres/Neon + Prisma, Socket.IO already behind a Redis adapter for multi-instance fan-out) does not need to change shape to add two more client types — from the backend's point of view, a Desktop or Mobile client is just another authenticated API consumer and another socket connection, the same load-shape as another browser tab today. The one place scale genuinely changes the calculus: the mirror strategy's deliberate choice of **full-refetch-and-replace over incremental-by-`updatedAt`** is correct at today's SMB/pyme data volumes (hundreds, not millions of rows per account) and was already evaluated and consciously deferred rather than missed — it should be revisited specifically if/when a real customer's catalog size makes full-refetch measurably slow, not preemptively, and not differently for Desktop/Mobile than it would be for Web. Nothing in this document's proposal (extend the custom sync engine, keep Socket.IO invalidate-and-refetch) requires a different answer at 1,000 vs. 100,000 accounts — the trigger for revisiting is data volume per account, not client-type count.

## 24. Cost Analysis

| Item | Cost | Notes |
|---|---|---|
| Apple Developer Program | $99/yr | Covers iOS App Store *and* macOS notarization — one membership, no separate notarization fee. |
| Google Play Developer | $25 one-time | Confirmed current. |
| Windows code signing | ~$10/mo (Azure Trusted Signing, recommended) or ~$200-400+/yr (traditional OV/EV cert, CA-mandated 1-year max lifespan as of Feb 2026) | EV no longer grants an automatic SmartScreen-reputation bypass (removed 2024) — Azure Trusted Signing is the pragmatic pick for a small team's CI pipeline. |
| Tauri auto-update hosting | $0 | Static `latest.json` + binaries on GitHub Releases or S3; a dynamic staged-rollout server is possible later on the existing Render backend at ~$0 marginal cost, not needed at launch. |
| EAS Build/Update (Expo) | $0 at launch scale (free tier: 15+15 builds/mo, OTA to 1,000 MAU) → $99/mo (Production) once mobile MAU crosses ~1,000 | MAU, not build volume, is the more likely trigger to upgrade for Ohnix's scale. |
| Monorepo tooling | $0 | pnpm + Turborepo (free remote cache on all tiers since Dec 2024); Nx only if/when adopted, then a per-contributor cost beyond free tier. |
| Sync/offline infrastructure | $0 (extended custom system) vs. $239+/mo (RxDB Pro Plus) or new Postgres-logical-replication infra + $49-599+/mo or self-host ops burden (PowerSync) vs. $0 self-host but unresolved RN support (ElectricSQL) | This is the largest recurring-cost divergence in the whole document — see §16. |
| App/Play Store review overhead | not a cash cost, a scheduling cost | 2-5 day new-submission turnaround in 2026 (up from historical ~24-48h), full extra cycle on rejection — budget release-date buffers. |

**Rough floor, year one, minimal viable multiplatform footprint**: ~$99 (Apple) + $25 (Google, one-time) + ~$120/yr (Windows signing via Azure Trusted Signing) + $0 (Tauri updates, Expo free tier, sync engine) ≈ **$250-350 first year, ~$225/yr ongoing** before crossing Expo's free-tier MAU ceiling — genuinely low, because the largest potential cost (an off-the-shelf sync product) is the one item this document recommends *not* adopting.

## 25. Migration Strategy

Staged, following the same "confirm with the user between stages, don't build it all at once" discipline the offline-first work already used successfully — reusing that Etapa numbering convention as **Fase** here to avoid collision with the completed Etapas 0-5:

- **Fase A — Shared foundation, no product change.** `pnpm-workspace.yaml`, Vercel/Render root-directory + filter-build config (verify deploys unaffected), extract `packages/sync-core` from the existing `outbox.js`/`syncEngine.js` behind the storage-adapter interface (Dexie adapter = the existing code, refactored to the interface, not rewritten). Zero visible change to the shipped web app.
- **Fase B — Desktop shell.** Tauri wrapping the existing React build: CSP/asset-path config, capability files, verify antd on WebKitGTK, confirm Socket.IO on default transport works end-to-end, keep Dexie as the desktop store initially. Ship to internal/pilot users first.
- **Fase C — POS hardware pilot.** One real store, one printer model: vet a thermal-printer/cash-drawer plugin (or sidecar fallback), confirm barcode-scanner HID passthrough end-to-end, harden before wider desktop rollout.
- **Fase D — Mobile app, narrower scope by design** (§12): new Expo Router-based UI, `expo-sqlite` adapter for `sync-core`, `expo-secure-store` auth, feature set deliberately limited to fast lookups/barcode scan/quick sale/notifications — not full back-office parity. Custom EAS dev client from day one if Bluetooth printing is in scope for mobile at all.
- **Fase E — Cross-platform hardening.** Version-gate middleware (§21), extend real-time invalidation to Desktop/Mobile clients, resolve the single-session-per-user question (§29) before Desktop+Mobile are both in a single owner's daily use.
- **Fase F — Revisit incremental sync only if data volume actually demands it** (§23) — not scheduled by default.

Each Fase is independently shippable and revertible, matching the explicit "no big-bang rewrite" instruction this brief opened with.

## 26. Recommended Architecture

Restated as the single diagram this document actually endorses (see §12 for the fuller version with rationale) — the brief's reference diagram was directionally right but oversimplified the local-DB layer (not one technology, one shared logic layer over three storage adapters) and omitted the real-time layer that already exists:

```
Neon PostgreSQL → Node/Express + Prisma (idempotency, real locks/Serializable txns)
                → Socket.IO + Redis adapter (account/POS rooms, data:changed)
                        │
        ┌───────────────┼───────────────┐
     WEB (React)      DESKTOP (Tauri)   MOBILE (React Native+Expo)
     Dexie            Dexie→maybe SQLite  SQLite
        └───────────────┼───────────────┘
              packages/sync-core (shared, storage-adapter interface)
```

## 27. Implementation Roadmap

Same as §25's Fases — deliberately not duplicated here as a second, divergent list; Fase A→F **is** the roadmap.

## 28. Risks

- **Reference risk (Desktop/POS)**: no verified production POS built on Tauri found — Fase C's single-store pilot exists specifically to retire this risk before wide rollout, not to discover it in production.
- **Hardware integration risk (both platforms)**: thermal printer/cash-drawer support rests on unofficial community plugins (Tauri) or uneven Bluetooth libraries requiring a custom dev client (Expo) — budget real integration and vetting time, not a weekend task.
- **WebKitGTK rendering risk (Desktop/Linux)**: real, documented rendering/animation quirks — needs its own verification pass, not just "if it works on Windows it works everywhere."
- **Sync-adapter risk**: extracting `sync-core` and writing two new storage adapters is bounded but real engineering work with its own edge cases (SQLite migration/schema-versioning semantics differ from Dexie's) — likelier failure mode is underestimating adapter edge cases than any conceptual gap in the approach.
- **Session-model risk**: the current single-session-per-user enforcement is incompatible with one owner running Desktop and Mobile simultaneously unless addressed — see §29, this needs a decision before Fase E, not after a support ticket.
- **Store-review scheduling risk**: mobile release dates need review-turnaround buffer (2-5+ days, more on rejection) baked into planning, not treated as instant like a Vercel deploy.

## 29. Open Questions

1. **Single-session-per-user vs. multi-device-per-owner.** Ohnix's backend today disconnects a user's existing session the moment they log in elsewhere (`session:replaced`) — correct for "someone else is using my account," wrong for "I have the POS desktop logged in at the store and my phone in my pocket, both legitimately me." This needs an explicit product decision (e.g., scope single-session enforcement per *device class* rather than per user, or introduce a distinct concept of "registered devices") before Desktop and Mobile both ship to the same real owners — it was out of scope for every research agent in this document because it's a business-logic decision, not a technology comparison, and it does not appear to have been flagged in the prior offline-first work either (that work predates multi-device-per-owner being a real scenario).
2. Does the backend already accept bearer-only requests (no cookie), which mobile auth depends on (§8, §19) — needs a direct check against the auth middleware before committing to that design, not an assumption.
3. Should Desktop initially reuse the exact same web build output wrapped by Tauri, or fork a lighter build without marketing/PWA-install-prompt code paths that make no sense inside a native shell? A build-config decision, not an architecture one — deferred to Fase B.
4. What is the actual first Bluetooth-hardware target for mobile (which printer models, if any) — this determines whether Fase D needs a custom dev client from day one or can defer that entirely.
5. Whether the previously-deferred "auth snapshot in Dexie for offline session validity" (§3, §19) should be pulled forward specifically because Mobile makes "haven't opened the app in days" a routine case rather than an edge case — recommended yes, but not yet scheduled into a Fase above; needs confirmation with the user before slotting it in.

## 30. Final Recommendation

**Tauri for Desktop. React Native + Expo for Mobile. Node + Prisma + PostgreSQL/Neon stay exactly as they are. Extend the existing custom outbox/idempotency/mirror sync engine rather than adopting RxDB, PowerSync, or ElectricSQL. Reuse the already-built Socket.IO real-time layer unchanged. Move to a pnpm-workspace monorepo incrementally, adding Turborepo when it earns its keep and Nx only if actually needed.**

This is grounded in what the real Ohnix codebase already is — a Prisma/Postgres backend that already enforces business-rule integrity with real database locks and a working, production-proven offline/sync/idempotency system on web, plus a real-time invalidation layer nobody asked this document to build because it already exists. None of the three off-the-shelf sync products were designed for a system whose actual hard requirement is "the server is always right about stock and money" — Ohnix's own system was built for exactly that, and extending it to two new storage adapters is less risk, less recurring cost, and less new production infrastructure than adopting any alternative. The one genuine gap this research surfaced that the prior offline-first work didn't need to consider — single-session-per-user colliding with one owner legitimately using Desktop and Mobile at once — is a product decision, not a technology choice, and should be resolved before both platforms reach the same real users.
