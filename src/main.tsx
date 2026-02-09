import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'

console.log('=== MAIN.TSX STARTING ===')

try {
  const rootElement = document.getElementById('root')
  console.log('Root element found:', !!rootElement)
  
  if (!rootElement) {
    throw new Error('Root element not found in DOM')
  }
  
  console.log('Creating React root...')
  const root = createRoot(rootElement)
  
  console.log('Rendering App...')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
  
  console.log('=== MAIN.TSX COMPLETE ===')
} catch (error) {
  console.error('=== FATAL ERROR ===', error)
  
  // Show error on page
  const rootElement = document.getElementById('root')
  if (rootElement) {
    rootElement.innerHTML = `
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
        <pre style="color: #d4a373; white-space: pre-wrap; word-break: break-word;">
${error instanceof Error ? error.stack : String(error)}
        </pre>
      </div>
    `
  }
}
