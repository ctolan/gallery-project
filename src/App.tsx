import { useState } from 'react'
import { Container, Dialog, DialogContent, DialogTitle } from '@mui/material'
import { ImageGallery } from './components/ImageGallery'
import { ArtworkUploadDraft } from './components/ArtworkUploadDraft'
import './App.css'

// Using local images from public/images folder
const galleryImages = [
  { id: '1', url: '/images/20250920_090826.jpg', title: 'New Image 1' },
  { id: '2', url: '/images/20250920_090836.jpg', title: 'New Image 2' },
  { id: '3', url: '/images/20250920_090846.jpg', title: 'New Image 3' },
]

function App() {
  const [selectedImage, setSelectedImage] = useState<{ id: string; url: string; title: string } | null>(null);

  const handleImageClick = (image: { id: string; url: string; title: string }) => {
    setSelectedImage(image);
  };

  return (
    <Container maxWidth="xl">
      <header className="gallery-header">
        <h1>Image Gallery</h1>
        <ArtworkUploadDraft />
      </header>
      <ImageGallery images={galleryImages} onImageClick={handleImageClick} />
      
      <Dialog
        open={!!selectedImage}
        onClose={() => setSelectedImage(null)}
        maxWidth="lg"
        fullWidth
      >
        {selectedImage && (
          <>
            <DialogTitle>{selectedImage.title}</DialogTitle>
            <DialogContent>
              <img
                src={selectedImage.url}
                alt={selectedImage.title}
                style={{ width: '100%', height: 'auto' }}
              />
            </DialogContent>
          </>
        )}
      </Dialog>
    </Container>
  )
}

export default App
