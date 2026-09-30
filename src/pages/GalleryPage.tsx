import { Alert, Container, Dialog, DialogContent, DialogTitle, Stack } from '@mui/material'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ImageGallery } from '../components/ImageGallery'
import { loadApprovedGallery } from '../features/artwork-upload/client'
import type { ApprovedGalleryItem } from '../features/artwork-upload/client'

// Using local images from public/images folder
const galleryImages = [
  { id: '1', url: '/images/20250920_090826.jpg', title: 'New Image 1' },
  { id: '2', url: '/images/20250920_090836.jpg', title: 'New Image 2' },
  { id: '3', url: '/images/20250920_090846.jpg', title: 'New Image 3' },
]

export function GalleryPage() {
  const [selectedImage, setSelectedImage] = useState<{ id: string; url: string; title: string } | null>(null)
  const [approvedItems, setApprovedItems] = useState<ApprovedGalleryItem[]>([])
  const [approvedItemsError, setApprovedItemsError] = useState('')

  useEffect(() => {
    if (!import.meta.env.VITE_ARTWORK_API_URL) return
    let cancelled = false
    loadApprovedGallery()
      .then((items) => {
        if (!cancelled) setApprovedItems(items)
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setApprovedItemsError(error instanceof Error ? error.message : 'Approved photos could not be loaded.')
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  const images = useMemo(
    () => [
      ...galleryImages,
      ...approvedItems.flatMap((item) =>
        item.images.map((image) => ({
          id: `approved-${item.id}-${image.id}`,
          url: image.url,
          title: item.title,
        })),
      ),
    ],
    [approvedItems],
  )

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
      {approvedItemsError && <Alert severity="error" sx={{ mb: 2 }}>{approvedItemsError}</Alert>}
      <ImageGallery images={images} onImageClick={handleImageClick} />

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
