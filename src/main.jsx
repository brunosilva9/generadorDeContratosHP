import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Cross-origin isolation (SharedArrayBuffer) is required by the LibreOffice
// WASM PDF path. GitHub Pages can't send COOP/COEP headers, so a service worker
// injects them. In dev, Vite already sets the headers (vite.config.js), so
// window.crossOriginIsolated is true here and this is a no-op.
if (!window.crossOriginIsolated && window.isSecureContext && 'serviceWorker' in navigator) {
  const swUrl = `${import.meta.env.BASE_URL}coi-serviceworker.min.js`
  navigator.serviceWorker.register(swUrl).then((reg) => {
    reg.addEventListener('updatefound', () => window.location.reload())
    if (reg.active && !navigator.serviceWorker.controller) window.location.reload()
  }).catch(() => {})
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
