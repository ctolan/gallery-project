export const MAX_OUTPUT_DIMENSION = 2560
export const OUTPUT_MIME_TYPE = 'image/jpeg'
export const OUTPUT_QUALITY = 0.85

export interface Dimensions {
  width: number
  height: number
}

export interface OptimizedArtworkPhoto {
  blob: Blob
  width: number
  height: number
  mimeType: string
  sizeBytes: number
}

/**
 * Pure aspect-ratio-preserving downscale to at most `maxDimension` on the
 * longest side. Never upscales. Exported separately from the canvas-based
 * resizer below so the math can be unit tested without a browser/DOM.
 */
export function computeResizedDimensions(
  original: Dimensions,
  maxDimension: number = MAX_OUTPUT_DIMENSION,
): Dimensions {
  const longestSide = Math.max(original.width, original.height)

  if (longestSide <= 0 || longestSide <= maxDimension) {
    return { width: original.width, height: original.height }
  }

  const scale = maxDimension / longestSide
  return {
    width: Math.max(1, Math.round(original.width * scale)),
    height: Math.max(1, Math.round(original.height * scale)),
  }
}

/**
 * Resizes and re-encodes a camera/gallery photo entirely in the browser.
 * Decoding through `createImageBitmap` and re-encoding through `<canvas>`
 * drops EXIF metadata (including GPS location) as a side effect, because the
 * canvas only ever holds decoded pixels - no metadata is carried into the
 * re-encoded output. `imageOrientation: 'from-image'` applies any EXIF
 * rotation before that metadata is discarded, so photos stay right-side up.
 *
 * Callers must not retain the original `File` after this resolves; only the
 * returned optimized blob should be kept or uploaded.
 */
export async function optimizeArtworkPhoto(
  file: File,
  maxDimension: number = MAX_OUTPUT_DIMENSION,
  quality: number = OUTPUT_QUALITY,
): Promise<OptimizedArtworkPhoto> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  try {
    const { width, height } = computeResizedDimensions(
      { width: bitmap.width, height: bitmap.height },
      maxDimension,
    )

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Canvas 2D context is unavailable in this browser.')
    }

    context.drawImage(bitmap, 0, 0, width, height)

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, OUTPUT_MIME_TYPE, quality),
    )

    if (!blob) {
      throw new Error('Failed to encode the optimized photo.')
    }

    return { blob, width, height, mimeType: OUTPUT_MIME_TYPE, sizeBytes: blob.size }
  } finally {
    bitmap.close()
  }
}
