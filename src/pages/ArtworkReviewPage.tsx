import { useCallback, useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Container,
  Stack,
  Typography,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext'
import { GoogleAccountPanel } from '../features/auth/GoogleAccountPanel'
import { useAuth } from '../features/auth/auth-context'
import { artworkReviewGateway } from '../features/artwork-upload/client'
import type { PendingArtworkReview } from '../features/artwork-upload/contracts'

function ArtworkReviewContent() {
  const { user } = useAuth()
  const [items, setItems] = useState<PendingArtworkReview[]>([])
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const loadPending = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError('')
    try {
      const token = await user.getIdToken()
      setItems(await artworkReviewGateway.listPending(token))
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load pending photos.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    void loadPending()
  }, [loadPending])

  useEffect(() => {
    if (!user) {
      setImageUrls({})
      return
    }
    if (items.length === 0) {
      setImageUrls({})
      return
    }
    let cancelled = false
    const urls: string[] = []

    const loadImages = async () => {
      try {
        const token = await user.getIdToken()
        const loaded: Record<string, string> = {}
        for (const submission of items) {
          for (const image of submission.images) {
            const blob = await artworkReviewGateway.loadPendingImage(
              submission.id,
              image.id,
              token,
            )
            const url = URL.createObjectURL(blob)
            urls.push(url)
            loaded[`${submission.id}:${image.id}`] = url
          }
        }
        if (!cancelled) setImageUrls(loaded)
        else urls.forEach(URL.revokeObjectURL)
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Could not load photo previews.')
        }
      }
    }
    void loadImages()

    return () => {
      cancelled = true
      urls.forEach(URL.revokeObjectURL)
    }
  }, [items, user])

  const decide = async (submissionId: string, decision: 'approve' | 'reject') => {
    if (!user) return
    setBusyId(submissionId)
    setError('')
    setMessage('')
    try {
      const token = await user.getIdToken()
      const status = await artworkReviewGateway.decide(submissionId, decision, token)
      setItems((current) => current.filter((item) => item.id !== submissionId))
      setMessage(status === 'approved'
        ? 'Approved. The optimized photos are now in the public gallery.'
        : 'Rejected. The private photos will be deleted after 14 days.')
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'Review decision failed.')
    } finally {
      setBusyId('')
    }
  }

  return (
    <Container maxWidth="md" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h5" component="h1">
            Parent photo review
          </Typography>
          <Button component={Link} to="/">
            Gallery
          </Button>
        </Stack>
        <GoogleAccountPanel />
        {!import.meta.env.VITE_ARTWORK_API_URL && (
          <Alert severity="warning">
            Review is unavailable until the private artwork API is configured and deployed.
          </Alert>
        )}
        {error && <Alert severity="error">{error}</Alert>}
        {message && <Alert severity="success">{message}</Alert>}
        {user && (
          <Button onClick={() => void loadPending()} disabled={loading} variant="outlined">
            Refresh pending submissions
          </Button>
        )}
        {loading && <CircularProgress aria-label="Loading pending submissions" />}
        {!loading && user && items.length === 0 && !error && (
          <Typography color="text.secondary">No photos are waiting for review.</Typography>
        )}
        {items.map((item) => (
          <Card key={item.id} variant="outlined">
            <CardContent>
              <Stack spacing={2}>
                <div>
                  <Typography variant="h6">{item.title}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    Submitted {new Date(item.submittedAt).toLocaleString()}
                  </Typography>
                </div>
                {item.note && <Typography>{item.note}</Typography>}
                <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                  {item.images.map((image) => (
                    <Box
                      key={image.id}
                      component="img"
                      src={imageUrls[`${item.id}:${image.id}`]}
                      alt={`Pending artwork: ${item.title}`}
                      sx={{
                        width: { xs: '100%', sm: 220 },
                        maxWidth: 300,
                        height: 220,
                        objectFit: 'contain',
                        bgcolor: 'grey.100',
                        borderRadius: 1,
                      }}
                    />
                  ))}
                </Stack>
                <Stack direction="row" spacing={2}>
                  <Button
                    variant="contained"
                    disabled={busyId === item.id}
                    onClick={() => void decide(item.id, 'approve')}
                  >
                    {item.status === 'publishing' ? 'Finish publishing' : 'Approve and publish'}
                  </Button>
                  {item.status === 'pending_review' && (
                    <Button
                      color="error"
                      variant="outlined"
                      disabled={busyId === item.id}
                      onClick={() => void decide(item.id, 'reject')}
                    >
                      Reject
                    </Button>
                  )}
                </Stack>
              </Stack>
            </CardContent>
          </Card>
        ))}
      </Stack>
    </Container>
  )
}

export function ArtworkReviewPage() {
  return (
    <AuthProvider>
      <ArtworkReviewContent />
    </AuthProvider>
  )
}
