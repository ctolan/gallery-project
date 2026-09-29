export interface ArtworkDraftInput {
  title: string
  note: string
  files: readonly File[]
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
