import type { OptimizedArtworkPhoto } from './resize'

export interface ArtworkDraftPhoto {
  /** Original filename, kept only for display; original bytes are discarded. */
  sourceFileName: string
  optimized: OptimizedArtworkPhoto
}

export interface ArtworkDraftInput {
  title: string
  note: string
  photos: readonly ArtworkDraftPhoto[]
}

export interface PendingArtworkSubmission {
  id: string
  status: 'pending_review'
}

export interface PendingArtworkReview {
  id: string
  title: string
  note: string
  submittedAt: string
}

export type ArtworkReviewDecision = 'approve' | 'reject'
export type ArtworkReviewStatus = 'approved' | 'rejected'

/**
 * Browser-side contract for submitting an already-optimized draft to the
 * private pending-review backend. `identityToken` must be a verified
 * Firebase ID token (or equivalent); the server must re-validate every
 * constraint applied client-side and must never trust this input alone.
 */
export interface ArtworkUploadGateway {
  submitDraft(
    input: ArtworkDraftInput,
    identityToken: string,
  ): Promise<PendingArtworkSubmission>
}

export interface ArtworkReviewGateway {
  listPending(identityToken: string): Promise<PendingArtworkReview[]>
  decide(
    submissionId: string,
    decision: ArtworkReviewDecision,
    identityToken: string,
  ): Promise<ArtworkReviewStatus>
}
