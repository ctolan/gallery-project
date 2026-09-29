export const MAX_ARTWORK_FILES = 5
export const MAX_ARTWORK_FILE_SIZE = 10 * 1024 * 1024
export const ACCEPTED_ARTWORK_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export interface ArtworkFileMetadata {
  name: string
  size: number
  type: string
}

export type ArtworkSelectionValidation =
  | { valid: true }
  | { valid: false; reason: string }

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

  const oversizedFile = files.find((file) => file.size > MAX_ARTWORK_FILE_SIZE)

  if (oversizedFile) {
    return {
      valid: false,
      reason: `${oversizedFile.name} is larger than the 10 MB per-photo limit.`,
    }
  }

  return { valid: true }
}
