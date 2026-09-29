import { Route, Routes } from 'react-router-dom'
import { GalleryPage } from './pages/GalleryPage'
import { ArtworkSubmitPage } from './pages/ArtworkSubmitPage'
import './App.css'

function App() {
  return (
    <Routes>
      <Route path="/" element={<GalleryPage />} />
      <Route path="/submit" element={<ArtworkSubmitPage />} />
    </Routes>
  )
}

export default App
