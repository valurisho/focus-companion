import { createRoot } from 'react-dom/client'
import './index.css'

function App() {
  return <main className="min-h-screen bg-stone-50 p-8 text-stone-900">
    <h1 className="text-3xl font-semibold">Focus Companion</h1>
    <p className="mt-2 text-stone-600">Your study space is ready.</p>
  </main>
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element was not found')
}

createRoot(container).render(<App />)
