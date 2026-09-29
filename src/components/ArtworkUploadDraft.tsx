import { useEffect, useState } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import type { ArtworkDraftInput } from '../features/artwork-upload/contracts'
import {
  ACCEPTED_ARTWORK_TYPES,
  MAX_ARTWORK_FILES,
  validateArtworkSelection,
} from '../features/artwork-upload/validation'

function PhotoPreview({ file }: { file: File }) {
  const [url, setUrl] = useState<string>()

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file)
    setUrl(objectUrl)

    return () => URL.revokeObjectURL(objectUrl)
  }, [file])

  return url ? (
    <Box
      component="img"
      src={url}
      alt={`Preview of ${file.name}`}
      sx={{ width: 88, height: 72, objectFit: 'cover', borderRadius: 1 }}
    />
  ) : null
}

export function ArtworkUploadDraft() {
  const [open, setOpen] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [prepared, setPrepared] = useState(false)

  const draft: ArtworkDraftInput = { title: title.trim(), note: note.trim(), files }

  const selectFiles = (selected: FileList | null) => {
    if (!selected) return

    const nextFiles = [...files, ...Array.from(selected)]
    const validation = validateArtworkSelection(nextFiles)
    if (!validation.valid) {
      setError(validation.reason)
      return
    }

    setFiles(nextFiles)
    setError('')
    setPrepared(false)
  }

  const prepareDraft = () => {
    const validation = validateArtworkSelection(draft.files)
    if (!validation.valid) {
      setError(validation.reason)
      return
    }
    if (!draft.title) {
      setError('Add a title for these photos.')
      return
    }

    setError('')
    setPrepared(true)
  }

  const close = () => setOpen(false)

  return (
    <>
      <Button variant="outlined" onClick={() => setOpen(true)}>
        Prepare photo draft
      </Button>
      <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
        <DialogTitle>Prepare an artwork draft</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <Alert severity="info">
              Upload and parent approval are not connected yet. This draft stays in this page's
              memory; it is not uploaded, saved, or published.
            </Alert>
            <TextField
              label="Title"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value.slice(0, 120))
                setPrepared(false)
              }}
              inputProps={{ maxLength: 120 }}
              required
              fullWidth
            />
            <TextField
              label="Note (optional)"
              value={note}
              onChange={(event) => {
                setNote(event.target.value.slice(0, 500))
                setPrepared(false)
              }}
              inputProps={{ maxLength: 500 }}
              multiline
              minRows={2}
              fullWidth
            />
            <Button component="label" variant="outlined">
              Choose photos
              <input
                hidden
                type="file"
                accept={ACCEPTED_ARTWORK_TYPES.join(',')}
                multiple
                onChange={(event) => {
                  selectFiles(event.currentTarget.files)
                  event.currentTarget.value = ''
                }}
              />
            </Button>
            <Typography variant="body2" color="text.secondary">
              JPEG, PNG, or WebP; up to {MAX_ARTWORK_FILES} photos, 10 MB each.
            </Typography>
            {files.map((file, index) => (
              <Stack key={`${file.name}-${file.lastModified}-${index}`} direction="row" spacing={2} alignItems="center">
                <PhotoPreview file={file} />
                <Typography sx={{ flex: 1, overflowWrap: 'anywhere' }}>
                  {file.name} ({(file.size / (1024 * 1024)).toFixed(1)} MB)
                </Typography>
                <Button
                  onClick={() => {
                    setFiles(files.filter((_, fileIndex) => fileIndex !== index))
                    setPrepared(false)
                  }}
                  aria-label={`Remove ${file.name}`}
                >
                  Remove
                </Button>
              </Stack>
            ))}
            {error && <Alert severity="error">{error}</Alert>}
            {prepared && (
              <Alert severity="success">
                Draft prepared locally. It has not been sent for review or made public.
              </Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Close</Button>
          <Button variant="contained" onClick={prepareDraft}>
            Prepare local draft
          </Button>
        </DialogActions>
      </Dialog>
    </>
  )
}
