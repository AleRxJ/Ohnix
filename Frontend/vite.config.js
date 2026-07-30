import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return

          // React + antd + rc-* MUST live in the same chunk.
          // rc-util reads React.version at module init time (top-level code).
          // If React is in a separate chunk it can still be undefined when that
          // line runs, causing "Cannot read properties of undefined ('version')".
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/antd/') ||
            id.includes('/rc-') ||
            id.includes('/@rc-component/') ||
            id.includes('/@ant-design/cssinjs/')
          ) {
            return 'vendor-antd-core'
          }

          if (id.includes('/@ant-design/icons/')) {
            return 'vendor-ant-icons'
          }

          if (id.includes('/@ant-design/plots/')) {
            return 'vendor-charts-antd-plots'
          }

          if (id.includes('/@antv/g2/')) {
            return 'vendor-charts-antv-g2'
          }

          if (id.includes('/@antv/g-lite/')) {
            return 'vendor-charts-antv-g-lite'
          }

          if (id.includes('/@antv/')) {
            return 'vendor-charts-antv-misc'
          }

          if (
            id.includes('/recharts/') ||
            id.includes('/d3-') ||
            id.includes('/victory-vendor/')
          ) {
            return 'vendor-charts-recharts'
          }

          if (id.includes('/i18next/') || id.includes('/react-i18next/')) {
            return 'vendor-i18n'
          }

          if (
            id.includes('/axios/') ||
            id.includes('/dayjs/') ||
            id.includes('/lodash/')
          ) {
            return 'vendor-utils'
          }

          return 'vendor-misc'
        },
      },
    },
  },
})
