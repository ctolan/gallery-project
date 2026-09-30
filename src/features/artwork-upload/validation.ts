export const MAX_ARTWORK_FILES = 5
export const ACCEPTED_ARTWORK_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

// Camera originals are only ever read in the browser to be resized; this cap
// covers typical modern phone camera photos before client-side optimization.
export const MAX_ORIGINAL_FILE_SIZE = 25 * 1024 * 1024

// Safety cap on the optimized (resized, re-encoded) photo that is actually
// uploaded. A real server must re-validate this independently - this constant
// only drives the browser UI, it is not a security boundary.
export const MAX_OPTIMIZED_FILE_SIZE = 4 * 1024 * 1024

export interface ArtworkFileMetadata {
  name: string
  size: number
  type: string
}

export type ArtworkSelectionValidation =
  | { valid: true }
  | { valid: false; reason: string }

/** Validates a batch of camera/gallery originals before client-side resizing. */
export function validateArtworkSelection(
  files: readonly ArtworkFileMetadata[],
): ArtworkSelectionValidation {
  if (files.length === 0) {
    return { valid: false, reason: 'Choose at least one photo.' }
  }

  if (files.length > MAX_ARTWORK_FILES) {
    return { valid: false, reason: `Choose no more than ${MAX_ARTWORK_FILES} photos.` }
  }

  const unsupportedFile = files.find(
    (file) => !ACCEPTED_ARTWORK_TYPES.some((type) => type === file.type),
  )

  if (unsupportedFile) {
    return {
      valid: false,
      reason: `${unsupportedFile.name} is not a supported JPEG, PNG, or WebP photo.`,
    }
  }

  const emptyFile = files.find((file) => file.size === 0)

  if (emptyFile) {
    return { valid: false, reason: `${emptyFile.name} is empty.` }
  }

  const oversizedFile = files.find((file) => file.size > MAX_ORIGINAL_FILE_SIZE)

  if (oversizedFile) {
    return {
      valid: false,
      reason: `${oversizedFile.name} is larger than the 25 MB per-photo camera limit.`,
    }
  }

  return { valid: true }
}

/** Validates a photo after it has been resized/re-encoded client-side. */
export function validateOptimizedPhoto(photo: {
  sizeBytes: number
  mimeType: string
}): ArtworkSelectionValidation {
  if (!ACCEPTED_ARTWORK_TYPES.some((type) => type === photo.mimeType)) {
    return { valid: false, reason: 'The optimized photo has an unsupported format.' }
  }

  if (photo.sizeBytes === 0) {
    return { valid: false, reason: 'The optimized photo is empty.' }
  }

  if (photo.sizeBytes > MAX_OPTIMIZED_FILE_SIZE) {
    return {
      valid: false,
      reason: 'The optimized photo is still larger than the 4 MB upload limit.',
    }
  }

  return { valid: true }
}
