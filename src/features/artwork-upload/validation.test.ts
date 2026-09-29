import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_ARTWORK_TYPES,
  MAX_ARTWORK_FILE_SIZE,
  MAX_ARTWORK_FILES,
  validateArtworkSelection,
  type ArtworkFileMetadata,
} from './validation'

const photo = (overrides: Partial<ArtworkFileMetadata> = {}): ArtworkFileMetadata => ({
  name: 'photo.jpg',
  size: 1024,
  type: 'image/jpeg',
  ...overrides,
})

describe('validateArtworkSelection', () => {
  it('accepts supported image types within the per-photo size limit', () => {
    const files = ACCEPTED_ARTWORK_TYPES.map((type, index) =>
      photo({ name: `photo-${index}`, type, size: MAX_ARTWORK_FILE_SIZE }),
    )

    expect(validateArtworkSelection(files)).toEqual({ valid: true })
  })

  it('requires at least one photo', () => {
    expect(validateArtworkSelection([])).toEqual({
      valid: false,
      reason: 'Choose at least one photo.',
    })
  })

  it('limits each draft to five photos', () => {
    const files = Array.from({ length: MAX_ARTWORK_FILES + 1 }, (_, index) =>
      photo({ name: `photo-${index}.jpg` }),
    )

    expect(validateArtworkSelection(files)).toMatchObject({ valid: false })
  })

  it('rejects unsupported file types', () => {
    expect(validateArtworkSelection([photo({ type: 'image/svg+xml' })])).toMatchObject({
      valid: false,
      reason: expect.stringContaining('not a supported'),
    })
  })

  it('rejects photos larger than 10 MB', () => {
    expect(validateArtworkSelection([photo({ size: MAX_ARTWORK_FILE_SIZE + 1 })])).toMatchObject({
      valid: false,
      reason: expect.stringContaining('10 MB'),
    })
  })

  it('rejects empty files', () => {
    expect(validateArtworkSelection([photo({ size: 0 })])).toMatchObject({
      valid: false,
      reason: expect.stringContaining('is empty'),
    })
  })
})
