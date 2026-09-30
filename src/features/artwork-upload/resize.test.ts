import { describe, expect, it } from 'vitest'
import { MAX_OUTPUT_DIMENSION, computeResizedDimensions } from './resize'

describe('computeResizedDimensions', () => {
  it('leaves photos at or under the max dimension unchanged', () => {
    expect(computeResizedDimensions({ width: 1920, height: 1080 })).toEqual({
      width: 1920,
      height: 1080,
    })
  })

  it('downscales a landscape photo so the longest side matches the max', () => {
    expect(computeResizedDimensions({ width: 6000, height: 4000 })).toEqual({
      width: MAX_OUTPUT_DIMENSION,
      height: 1707,
    })
  })

  it('downscales a portrait photo so the longest side matches the max', () => {
    expect(computeResizedDimensions({ width: 3000, height: 4000 })).toEqual({
      width: 1920,
      height: MAX_OUTPUT_DIMENSION,
    })
  })

  it('never upscales a smaller photo', () => {
    expect(computeResizedDimensions({ width: 400, height: 300 }, 2560)).toEqual({
      width: 400,
      height: 300,
    })
  })

  it('supports a custom max dimension', () => {
    expect(computeResizedDimensions({ width: 4000, height: 2000 }, 1000)).toEqual({
      width: 1000,
      height: 500,
    })
  })
})
