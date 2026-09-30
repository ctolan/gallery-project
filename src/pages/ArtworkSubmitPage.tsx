import { useEffect, useId, useRef, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Container,
  IconButton,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import { Link } from 'react-router-dom'
import { AuthProvider } from '../features/auth/AuthContext'
import { GoogleAccountPanel } from '../features/auth/GoogleAccountPanel'
import { useAuth } from '../features/auth/auth-context'
import { artworkUploadGateway } from '../features/artwork-upload/client'
import type { ArtworkDraftPhoto } from '../features/artwork-upload/contracts'
import { optimizeArtworkPhoto, type OptimizedArtworkPhoto } from '../features/artwork-upload/resize'
import {
  ACCEPTED_ARTWORK_TYPES,
  MAX_ARTWORK_FILES,
  validateArtworkSelection,
  validateOptimizedPhoto,
} from '../features/artwork-upload/validation'

interface DraftPhotoEntry {
  id: string
  sourceFileName: string
  status: 'optimizing' | 'ready' | 'error'
  optimized?: OptimizedArtworkPhoto
  previewUrl?: string
  error?: string
}

let nextEntryId = 0

function ArtworkSubmitContent() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<DraftPhotoEntry[]>([])
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [selectionError, setSelectionError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submissionId, setSubmissionId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const titleFieldId = useId()
  const entriesRef = useRef(entries)
  const mountedRef = useRef(false)
  const cancelledEntriesRef = useRef(new Set<string>())
  entriesRef.current = entries

  // Revoke every remaining preview object URL when the page unmounts, since
  // those URLs reference the optimized blobs kept only in this page's memory.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      for (const entry of entriesRef.current) {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
      }
    }
  }, [])

  const readyPhotos: ArtworkDraftPhoto[] = entries
    .filter((entry): entry is DraftPhotoEntry & { optimized: OptimizedArtworkPhoto } =>
      entry.status === 'ready' && !!entry.optimized,
    )
    .map((entry) => ({ sourceFileName: entry.sourceFileName, optimized: entry.optimized }))

  const handleFilesSelected = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    const incoming = Array.from(fileList)
    const remainingSlots = MAX_ARTWORK_FILES - entriesRef.current.length

    if (remainingSlots <= 0) {
      setSelectionError(`You can only submit up to ${MAX_ARTWORK_FILES} photos at a time.`)
      return
    }

    const accepted = incoming.slice(0, remainingSlots)
    if (accepted.length < incoming.length) {
      setSelectionError(`Only the first ${remainingSlots} photo(s) were added (limit ${MAX_ARTWORK_FILES}).`)
    } else {
      setSelectionError('')
    }

    for (const file of accepted) {
      const validation = validateArtworkSelection([file])
      const id = `photo-${nextEntryId++}`

      if (!validation.valid) {
        setEntries((current) => [
          ...current,
          { id, sourceFileName: file.name, status: 'error', error: validation.reason },
        ])
        continue
      }

      setEntries((current) => [
        ...current,
        { id, sourceFileName: file.name, status: 'optimizing' },
      ])

      // `file` is only referenced inside this resize call. Once it resolves,
      // nothing in this component holds the original bytes - only the
      // resized, metadata-stripped output below is kept.
      optimizeArtworkPhoto(file)
        .then((optimized) => {
          if (!mountedRef.current || cancelledEntriesRef.current.has(id)) return
          const outputValidation = validateOptimizedPhoto(optimized)
          if (!outputValidation.valid) {
            setEntries((current) =>
              current.map((entry) =>
                entry.id === id
                  ? { ...entry, status: 'error', error: outputValidation.reason }
                  : entry,
              ),
            )
            return
          }

          const previewUrl = URL.createObjectURL(optimized.blob)
          setEntries((current) =>
            current.map((entry) =>
              entry.id === id ? { ...entry, status: 'ready', optimized, previewUrl } : entry,
            ),
          )
        })
        .catch((error: unknown) => {
          if (!mountedRef.current || cancelledEntriesRef.current.has(id)) return
          const message = error instanceof Error ? error.message : 'Could not process this photo.'
          setEntries((current) =>
            current.map((entry) => (entry.id === id ? { ...entry, status: 'error', error: message } : entry)),
          )
        })
    }
  }

  const removeEntry = (id: string) => {
    cancelledEntriesRef.current.add(id)
    setEntries((current) => {
      const entry = current.find((item) => item.id === id)
      if (entry?.previewUrl) URL.revokeObjectURL(entry.previewUrl)
      return current.filter((item) => item.id !== id)
    })
  }

  const isOptimizing = entries.some((entry) => entry.status === 'optimizing')
  const hasErrors = entries.some((entry) => entry.status === 'error')
  const apiConfigured = Boolean(import.meta.env.VITE_ARTWORK_API_URL)
  const uploadEnabled = apiConfigured && import.meta.env.VITE_ARTWORK_UPLOAD_ENABLED === 'true'
  const draftIsReady = readyPhotos.length > 0 && title.trim().length > 0 && !isOptimizing && !hasErrors
  const canSubmit = draftIsReady && Boolean(user) && uploadEnabled && !submitting

  const submitDraft = async () => {
    if (!user || !canSubmit) return
    setSubmitting(true)
    setSubmitError('')
    try {
      const identityToken = await user.getIdToken()
      const result = await artworkUploadGateway.submitDraft(
        { title: title.trim(), note: note.trim(), photos: readyPhotos },
        identityToken,
      )
      setSubmissionId(result.id)
      for (const entry of entries) {
        if (entry.previewUrl) URL.revokeObjectURL(entry.previewUrl)
      }
      setEntries([])
      setTitle('')
      setNote('')
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Photo submission failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Stack spacing={2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h5" component="h1">
            Submit photos
          </Typography>
          <Stack direction="row" spacing={1}>
            <Button component={Link} to="/review" size="small">
              Parent review
            </Button>
            <Button component={Link} to="/" size="small">
              Gallery
            </Button>
          </Stack>
        </Stack>

        <Alert severity="info">
          When connected to the private upload service, your photos stay private until a parent
          reviews and approves them. A pending or rejected photo never appears in the gallery.
        </Alert>

        <GoogleAccountPanel />
        {!apiConfigured && (
          <Alert severity="warning">
            The private upload service is not configured in this build. Photos stay on this device
            and the submit button is disabled.
          </Alert>
        )}
        {apiConfigured && !uploadEnabled && (
          <Alert severity="warning">
            Uploads remain disabled until the deployed API passes the documented security and
            approval checks. No photo leaves this device yet.
          </Alert>
        )}

        <TextField
          id={titleFieldId}
          label="Title"
          value={title}
          onChange={(event) => setTitle(event.target.value.slice(0, 120))}
          inputProps={{ maxLength: 120 }}
          required
          fullWidth
        />
        <TextField
          label="Note (optional)"
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          inputProps={{ maxLength: 500 }}
          multiline
          minRows={2}
          fullWidth
        />

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          <Button component="label" variant="contained" size="large">
            Take a photo
            <input
              hidden
              type="file"
              accept={ACCEPTED_ARTWORK_TYPES.join(',')}
              capture="environment"
              onChange={(event) => {
                handleFilesSelected(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
          </Button>
          <Button component="label" variant="outlined" size="large">
            Choose from library
            <input
              hidden
              type="file"
              accept={ACCEPTED_ARTWORK_TYPES.join(',')}
              multiple
              onChange={(event) => {
                handleFilesSelected(event.currentTarget.files)
                event.currentTarget.value = ''
              }}
            />
          </Button>
        </Stack>

        <Typography variant="body2" color="text.secondary">
          Camera photos up to 25 MB are accepted. Each is resized to at most 2560px on the longest
          side and re-encoded below 4 MB before upload, which also removes location and other metadata. Only
          the resized copy is ever kept or sent - the original file is discarded on this device.
        </Typography>

        {selectionError && <Alert severity="error">{selectionError}</Alert>}
        {submitError && <Alert severity="error">{submitError}</Alert>}
        {submissionId && (
          <Alert severity="success">
            Sent for parent approval. Reference: {submissionId}. It is not public until approved.
          </Alert>
        )}

        {entries.map((entry) => (
          <Stack
            key={entry.id}
            direction="row"
            spacing={2}
            alignItems="center"
            sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}
          >
            {entry.status === 'optimizing' && <CircularProgress size={32} />}
            {entry.status === 'ready' && entry.previewUrl && (
              <Box
                component="img"
                src={entry.previewUrl}
                alt={`Optimized preview of ${entry.sourceFileName}`}
                sx={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 1 }}
              />
            )}
            <Stack sx={{ flex: 1, minWidth: 0 }}>
              <Typography noWrap>{entry.sourceFileName}</Typography>
              {entry.status === 'optimizing' && (
                <Typography variant="body2" color="text.secondary">
                  Optimizing on this device…
                </Typography>
              )}
              {entry.status === 'ready' && entry.optimized && (
                <Typography variant="body2" color="text.secondary">
                  {entry.optimized.width}×{entry.optimized.height},{' '}
                  {(entry.optimized.sizeBytes / (1024 * 1024)).toFixed(1)} MB optimized
                </Typography>
              )}
              {entry.status === 'error' && (
                <Typography variant="body2" color="error">
                  {entry.error}
                </Typography>
              )}
            </Stack>
            <IconButton aria-label={`Remove ${entry.sourceFileName}`} onClick={() => removeEntry(entry.id)}>
              ✕
            </IconButton>
          </Stack>
        ))}

        <Button
          variant="contained"
          size="large"
          disabled={!canSubmit}
          onClick={() => void submitDraft()}
          title={uploadEnabled ? 'Send optimized photos for parent approval' : 'Requires deployed and verified upload service'}
        >
          {submitting ? 'Sending…' : 'Send for parent approval'}
        </Button>
        {draftIsReady && !uploadEnabled && (
          <Typography variant="body2" color="text.secondary">
            This draft is ready to send once the private upload backend is deployed and verified.
          </Typography>
        )}
      </Stack>
    </Container>
  )
}

export function ArtworkSubmitPage() {
  return (
    <AuthProvider>
      <ArtworkSubmitContent />
    </AuthProvider>
  )
}
