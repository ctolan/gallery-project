import { lazy, Suspense } from 'react'
import { CircularProgress } from '@mui/material'
import { Navigate, Route, Routes } from 'react-router-dom'
import { GalleryPage } from './pages/GalleryPage'
import './App.css'

const ArtworkSubmitPage = lazy(() =>
  import('./pages/ArtworkSubmitPage').then((module) => ({ default: module.ArtworkSubmitPage })),
)
const ArtworkReviewPage = lazy(() =>
  import('./pages/ArtworkReviewPage').then((module) => ({ default: module.ArtworkReviewPage })),
)

function App() {
  return (
    <Suspense fallback={<CircularProgress aria-label="Loading page" />}>
      <Routes>
        <Route path="/" element={<GalleryPage />} />
        <Route path="/submit" element={<ArtworkSubmitPage />} />
        <Route path="/review" element={<ArtworkReviewPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
