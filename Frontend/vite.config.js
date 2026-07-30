import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Packages that MUST stay in the single vendor chunk.
// rc-util reads React.version at module init time (top-level code), so any
// chunk split between these packages causes TDZ / undefined errors in prod.
const REACT_ECOSYSTEM_PKGS = [
  '/react/',
  '/react-dom/',
  '/scheduler/',
  '/antd/',
  '/rc-',
  '/@rc-component/',
  '/@ant-design/',
]

/**
 * Build-time guard: fails the build if any React-ecosystem package ends up in
 * a chunk other than "vendor".  Catches bad manualChunks changes before prod.
 */
function chunkSafetyGuard() {
  return {
    name: 'chunk-safety-guard',
    generateBundle(_, bundle) {
      for (const [fileName, chunk] of Object.entries(bundle)) {
        if (chunk.type !== 'chunk') continue
        // Only the vendor chunk is allowed to contain these packages.
        // Vite prefixes chunk filenames with "assets/", e.g. "assets/vendor-abc123.js"
        if (/(?:^|\/)vendor[-.][^/]+\.js$/.test(fileName)) continue

        for (const moduleId of Object.keys(chunk.modules ?? {})) {
          if (!moduleId.includes('node_modules')) continue
          const offender = REACT_ECOSYSTEM_PKGS.find(pkg => moduleId.includes(pkg))
          if (offender) {
            this.error(
              `[chunk-safety-guard] "${offender.trim()}" leaked into chunk "${fileName}".\n` +
              `React-ecosystem packages must stay in the single "vendor" chunk.\n` +
              `A split here causes TDZ / "Cannot read properties of undefined" errors in production.\n` +
              `Fix: do not add manualChunks rules for React, antd, rc-*, or @ant-design/*.`
            )
          }
        }
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), chunkSafetyGuard()],
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

          // Heavy chart libraries are self-contained — keep them separate
          // so they only load on pages that need them.
          if (id.includes('/@antv/g2/'))    return 'vendor-charts-g2'
          if (id.includes('/@antv/g-lite/')) return 'vendor-charts-g-lite'
          if (id.includes('/@antv/'))        return 'vendor-charts-antv'
          if (id.includes('/@ant-design/plots/')) return 'vendor-charts-plots'
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
