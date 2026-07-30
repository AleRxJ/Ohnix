import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    // Only split out the heavy chart libraries — they are truly independent
    // and don't call React APIs at module initialization time.
    // All React-dependent packages (antd, rc-*, icons, i18n, utils, etc.)
    // are left to Vite's automatic chunking so it can guarantee correct
    // initialization order and avoid "Cannot read properties of undefined" errors.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          if (id.includes('/@ant-design/plots/')) return 'vendor-charts-antd-plots'
          if (id.includes('/@antv/g2/'))          return 'vendor-charts-antv-g2'
          if (id.includes('/@antv/g-lite/'))       return 'vendor-charts-antv-g-lite'
          if (id.includes('/@antv/'))              return 'vendor-charts-antv-misc'

          if (
            id.includes('/recharts/') ||
            id.includes('/d3-') ||
            id.includes('/victory-vendor/')
          ) {
            return 'vendor-charts-recharts'
          }
        },
      },
    },
  },
})
