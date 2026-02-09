import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

console.log('=== MAIN.TSX STARTING ===')

// Test if root element exists
const rootElement = document.getElementById('root')
console.log('Root element:', rootElement)

if (!rootElement) {
  console.error('Root element not found!')
} else {
  console.log('Root element found, clearing...')
  rootElement.innerHTML = '<p style="color:green;padding:20px;">React loading...</p>'
  
  try {
    console.log('Importing App...')
    import('./App.tsx').then(({ default: App }) => {
      console.log('App imported, creating root...')
      const root = createRoot(rootElement)
      console.log('Root created, rendering...')
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      )
      console.log('=== RENDER COMPLETE ===')
    }).catch(err => {
      console.error('Failed to import App:', err)
      rootElement.innerHTML = `<p style="color:red;padding:20px;">Import error: ${err.message}</p>`
    })
  } catch (err) {
    console.error('Fatal error:', err)
    rootElement.innerHTML = `<p style="color:red;padding:20px;">Fatal error: ${err}</p>`
  }
}
