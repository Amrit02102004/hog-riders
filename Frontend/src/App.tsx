import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Home from './Home/Home'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
      </Routes>
      <div className="flex flex-col items-center mt-8">
        <h1 className="text-3xl font-bold mb-4">Vite + React + Tailwind</h1>
      </div>
    </BrowserRouter>
  )
}

export default App
