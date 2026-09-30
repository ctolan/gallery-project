import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import sharp from 'sharp'
import { InvalidArtworkError, MAX_DIMENSION, sanitizeArtworkImage } from '../src/image-processing.js'

describe('sanitizeArtworkImage', () => {
  it('decodes, resizes, and re-encodes valid image bytes as JPEG', async () => {
    const original = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: '#123456' },
    }).png().toBuffer()

    const sanitized = await sanitizeArtworkImage(original, 'image/png')
    const metadata = await sharp(sanitized.buffer).metadata()
    assert.equal(metadata.format, 'jpeg')
    assert.equal(metadata.width, MAX_DIMENSION)
    assert.equal(metadata.height, 1280)
    assert.equal(sanitized.mimeType, 'image/jpeg')
    assert.equal(metadata.exif, undefined)
    assert.equal(metadata.icc, undefined)
  })

  it('removes metadata from an otherwise already-small JPEG', async () => {
    const original = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#abcdef' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()
    const sanitized = await sanitizeArtworkImage(original, 'image/jpeg')
    const metadata = await sharp(sanitized.buffer).metadata()

    assert.equal(metadata.orientation, undefined)
    assert.equal(metadata.exif, undefined)
  })

  it('rejects bytes whose actual format does not match the claimed type', async () => {
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#000000' },
    }).png().toBuffer()

    await assert.rejects(
      sanitizeArtworkImage(png, 'image/jpeg'),
      InvalidArtworkError,
    )
  })

  it('rejects files over the server-side byte limit', async () => {
    await assert.rejects(
      sanitizeArtworkImage(Buffer.alloc(4 * 1024 * 1024 + 1), 'image/jpeg'),
      /4 MB/,
    )
  })
})
