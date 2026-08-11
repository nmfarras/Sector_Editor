import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    resolve: {
      alias: {
        '@': resolve('src/renderer/src'),
        '@assets': resolve('src/renderer/src/assets'),
        '@components': resolve('src/renderer/src/components'),
        '@constants': resolve('src/renderer/src/constants'),
        '@context': resolve('src/renderer/src/context'),
        '@data': resolve('src/renderer/src/data'),
        '@interfaces': resolve('src/renderer/src/interfaces'),
        '@pages': resolve('src/renderer/src/pages'),
        '@services': resolve('src/renderer/src/services'),
        '@styles': resolve('src/renderer/src/styles'),
        '@utils': resolve('src/renderer/src/utils')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
