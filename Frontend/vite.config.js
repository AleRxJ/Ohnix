import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
