import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { reloadForFreshBundle } from './utils/chunkReload'

// Vite avisa cuando falla la precarga de un chunk (tipico tras un deploy con
// la pestana abierta): se recarga una vez para tomar el bundle nuevo.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForFreshBundle()) {
    event.preventDefault()
  }
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
