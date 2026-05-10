import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Repo name — used as the base path when serving from GitHub Pages
// (https://brunosilva9.github.io/generadorDeContratosHP/).
const REPO = 'generadorDeContratosHP'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? `/${REPO}/` : '/',
}))
