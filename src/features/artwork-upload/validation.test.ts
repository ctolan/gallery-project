import { describe, expect, it } from 'vitest'
import {
  ACCEPTED_ARTWORK_TYPES,
  MAX_ARTWORK_FILES,
  MAX_ORIGINAL_FILE_SIZE,
  MAX_OPTIMIZED_FILE_SIZE,
  validateArtworkSelection,
  validateOptimizedPhoto,
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
      photo({ name: `photo-${index}`, type, size: MAX_ORIGINAL_FILE_SIZE }),
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

  it('rejects photos larger than the 25 MB camera-original limit', () => {
    expect(validateArtworkSelection([photo({ size: MAX_ORIGINAL_FILE_SIZE + 1 })])).toMatchObject({
      valid: false,
      reason: expect.stringContaining('25 MB'),
    })
  })

  it('rejects empty files', () => {
    expect(validateArtworkSelection([photo({ size: 0 })])).toMatchObject({
      valid: false,
      reason: expect.stringContaining('is empty'),
    })
  })
})

describe('validateOptimizedPhoto', () => {
  it('accepts an optimized photo within the upload limit', () => {
    expect(
      validateOptimizedPhoto({ sizeBytes: MAX_OPTIMIZED_FILE_SIZE, mimeType: 'image/jpeg' }),
    ).toEqual({ valid: true })
  })

  it('rejects an optimized photo over the 4 MB upload limit', () => {
    expect(
      validateOptimizedPhoto({ sizeBytes: MAX_OPTIMIZED_FILE_SIZE + 1, mimeType: 'image/jpeg' }),
    ).toMatchObject({ valid: false, reason: expect.stringContaining('4 MB') })
  })

  it('rejects an empty optimized photo', () => {
    expect(validateOptimizedPhoto({ sizeBytes: 0, mimeType: 'image/jpeg' })).toMatchObject({
      valid: false,
      reason: expect.stringContaining('empty'),
    })
  })

  it('rejects an unsupported optimized format', () => {
    expect(
      validateOptimizedPhoto({ sizeBytes: 1024, mimeType: 'image/gif' }),
    ).toMatchObject({ valid: false })
  })
})
