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

          // React must be chunked first so rc-* chunks can always resolve it
          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/react-router/')
          ) {
            return 'vendor-react-core'
          }

          // rc-* MUST be in the same chunk as antd — they are tightly coupled
          // and splitting them causes circular init errors (React.version undefined)
          if (
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
