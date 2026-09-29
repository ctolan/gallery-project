import { Container, Dialog, DialogContent, DialogTitle, Stack } from '@mui/material'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageGallery } from '../components/ImageGallery'

// Using local images from public/images folder
const galleryImages = [
  { id: '1', url: '/images/20250920_090826.jpg', title: 'New Image 1' },
  { id: '2', url: '/images/20250920_090836.jpg', title: 'New Image 2' },
  { id: '3', url: '/images/20250920_090846.jpg', title: 'New Image 3' },
]

export function GalleryPage() {
  const [selectedImage, setSelectedImage] = useState<{ id: string; url: string; title: string } | null>(null)

  const handleImageClick = (image: { id: string; url: string; title: string }) => {
    setSelectedImage(image)
  }

  return (
    <Container maxWidth="xl">
      <Stack
        component="header"
        className="gallery-header"
        direction="row"
        alignItems="center"
        justifyContent="center"
        flexWrap="wrap"
        gap={2}
      >
        <h1>Image Gallery</h1>
        <Link to="/submit" className="submit-link">
          Submit photos
        </Link>
      </Stack>
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
