import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  main: {
    // The ACP SDK is ESM-only and main is CommonJS, so it's bundled in rather than required.
    plugins: [externalizeDepsPlugin({ exclude: ['@agentclientprotocol/sdk'] })],
    resolve: { alias: { '@shared': resolve('src/shared') } },
    // picturesMcp.js: Tyslin's pictures tool, run by the adapters as a separate process (main/assets.ts).
    build: { rollupOptions: { input: { index: resolve('src/main/index.ts'), picturesMcp: resolve('src/main/picturesMcp.ts') } } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: { '@shared': resolve('src/shared') } }
  },
  renderer: {
    // '@' is the renderer source (shadcn/ui's alias: '@/components/ui', '@/lib/utils').
    resolve: { alias: { '@shared': resolve('src/shared'), '@': resolve('src/renderer/src') } },
    plugins: [react(), tailwindcss()]
  }
})
