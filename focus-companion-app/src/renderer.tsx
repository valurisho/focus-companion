import { createRoot } from 'react-dom/client'

function App() {
  return <h1>Hello from React</h1>
}

const container = document.getElementById('root')

if (!container) {
  throw new Error('Root element was not found')
}

createRoot(container).render(<App />)