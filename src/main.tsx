import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// Error handler
try {
  console.log('Dwarf History: Starting app...')
  const root = document.getElementById('root')
  if (!root) {
    throw new Error('Root element not found')
  }
  
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  console.log('Dwarf History: App mounted successfully')
} catch (error) {
  console.error('Dwarf History: Failed to start app:', error)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML = `
      <div style="
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
        background: #0a0a0a;
        color: #c0c0c0;
        font-family: 'Courier New', monospace;
        padding: 2rem;
      ">
        <h1 style="color: #e76f51;">⚠️ Error Starting App</h1>
        <pre style="color: #d4a373; max-width: 600px; overflow: auto;">
${error instanceof Error ? error.message : String(error)}
        </pre>
        <p style="margin-top: 1rem; color: #808080;">
          Check browser console (F12) for more details.
        </p>
      </div>
    `
  }
}
