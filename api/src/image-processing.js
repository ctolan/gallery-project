import sharp from 'sharp'

export const MAX_FILE_BYTES = 4 * 1024 * 1024
export const MAX_FILE_COUNT = 5
export const MAX_DIMENSION = 2560
export const MAX_PIXELS = 25_000_000

const acceptedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
const formatMimeTypes = new Map([
  ['jpeg', 'image/jpeg'],
  ['png', 'image/png'],
  ['webp', 'image/webp'],
])

export class InvalidArtworkError extends Error {
  constructor(message) {
    super(message)
    this.name = 'InvalidArtworkError'
  }
}

/**
 * Never trust the browser's type, dimensions, resized bytes, or metadata.
 * Decode the actual image, enforce pixel limits, rotate from EXIF, resize
 * again if needed, and emit fresh JPEG bytes with no copied metadata.
 */
export async function sanitizeArtworkImage(buffer, claimedMimeType) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_FILE_BYTES) {
    throw new InvalidArtworkError('Photo must be non-empty and no larger than 4 MB.')
  }

  if (!acceptedMimeTypes.has(claimedMimeType)) {
    throw new InvalidArtworkError('Only JPEG, PNG, and WebP photos are accepted.')
  }

  let source
  let metadata
  try {
    source = sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
    metadata = await source.metadata()
  } catch {
    throw new InvalidArtworkError('Photo is invalid, damaged, or exceeds the pixel limit.')
  }

  if (formatMimeTypes.get(metadata.format) !== claimedMimeType) {
    throw new InvalidArtworkError('Photo content does not match its declared image type.')
  }

  if (!metadata.width || !metadata.height || metadata.pages && metadata.pages > 1) {
    throw new InvalidArtworkError('Animated or dimensionless images are not accepted.')
  }

  try {
    const { data, info } = await source
      .rotate()
      .resize({
        width: MAX_DIMENSION,
        height: MAX_DIMENSION,
        fit: 'inside',
        withoutEnlargement: true,
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer({ resolveWithObject: true })

    if (!data.length || data.length > MAX_FILE_BYTES) {
      throw new InvalidArtworkError('Processed photo exceeds the 4 MB upload limit.')
    }

    return {
      buffer: data,
      width: info.width,
      height: info.height,
      sizeBytes: data.length,
      mimeType: 'image/jpeg',
    }
  } catch (error) {
    if (error instanceof InvalidArtworkError) throw error
    throw new InvalidArtworkError('Photo could not be safely decoded and re-encoded.')
  }
}
