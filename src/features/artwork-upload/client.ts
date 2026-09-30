import type {
  ArtworkDraftInput,
  ArtworkReviewDecision,
  ArtworkReviewGateway,
  ArtworkUploadGateway,
  PendingArtworkReview,
  PendingArtworkSubmission,
} from './contracts'

export interface ApprovedGalleryItem {
  id: string
  title: string
  images: Array<{ id: string; url: string; width: number; height: number }>
}

const apiOrigin = (import.meta.env.VITE_ARTWORK_API_URL ?? '').replace(/\/+$/, '')

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `Artwork API request failed (${response.status}).`
    try {
      const body = (await response.json()) as { error?: unknown }
      if (typeof body.error === 'string') message = body.error
    } catch {
      // Keep the explicit status message when an upstream proxy returns non-JSON.
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

async function fetchWithIdentity(
  path: string,
  identityToken: string,
  init: RequestInit = {},
): Promise<Response> {
  if (!apiOrigin) throw new Error('Artwork API has not been configured in this build.')
  return fetch(`${apiOrigin}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${identityToken}`,
    },
  })
}

export const artworkUploadGateway: ArtworkUploadGateway = {
  async submitDraft(input: ArtworkDraftInput, identityToken: string): Promise<PendingArtworkSubmission> {
    const body = new FormData()
    body.set('title', input.title)
    body.set('note', input.note)
    input.photos.forEach((photo, index) => {
      body.append('photos', photo.optimized.blob, `photo-${index + 1}.jpg`)
    })
    const response = await fetchWithIdentity('/api/submissions', identityToken, {
      method: 'POST',
      body,
    })
    return readResponse<PendingArtworkSubmission>(response)
  },
}

export const artworkReviewGateway: ArtworkReviewGateway = {
  async listPending(identityToken: string): Promise<PendingArtworkReview[]> {
    const response = await fetchWithIdentity('/api/review/submissions', identityToken)
    const result = await readResponse<{ items: PendingArtworkReview[] }>(response)
    return result.items
  },

  async loadPendingImage(
    submissionId: string,
    imageId: string,
    identityToken: string,
  ): Promise<Blob> {
    const response = await fetchWithIdentity(
      `/api/review/submissions/${encodeURIComponent(submissionId)}/images/${encodeURIComponent(imageId)}`,
      identityToken,
    )
    if (!response.ok) {
      let message = `Photo preview failed (${response.status}).`
      try {
        const body = (await response.json()) as { error?: unknown }
        if (typeof body.error === 'string') message = body.error
      } catch {
        // Preserve the response status when no structured API error exists.
      }
      throw new Error(message)
    }
    return response.blob()
  },

  async decide(
    submissionId: string,
    decision: ArtworkReviewDecision,
    identityToken: string,
  ): Promise<'approved' | 'rejected'> {
    const response = await fetchWithIdentity(
      `/api/review/submissions/${encodeURIComponent(submissionId)}/decision`,
      identityToken,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      },
    )
    const result = await readResponse<{ status: 'approved' | 'rejected' }>(response)
    return result.status
  },
}

export async function loadApprovedGallery(): Promise<ApprovedGalleryItem[]> {
  if (!apiOrigin) return []
  const response = await fetch(`${apiOrigin}/api/gallery`)
  const result = await readResponse<{ items: ApprovedGalleryItem[] }>(response)
  return result.items
}

export function reviewDecisionLabel(decision: ArtworkReviewDecision) {
  return decision === 'approve' ? 'Approve' : 'Reject'
}
