import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Repo name — used as the base path when serving from GitHub Pages
// (https://brunosilva9.github.io/generadorDeContratosHP/).
const REPO = 'generadorDeContratosHP'

// Cross-origin isolation headers — required so SharedArrayBuffer is available,
// which the LibreOffice WASM PoC (public/poc/) needs to spin up its threads.
const crossOriginIsolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? `/${REPO}/` : '/',
  server: { headers: crossOriginIsolation },
  preview: { headers: crossOriginIsolation },
}))
