import { randomUUID } from 'node:crypto'
import express from 'express'
import multer from 'multer'
import { InvalidArtworkError, MAX_FILE_BYTES, MAX_FILE_COUNT, sanitizeArtworkImage } from './image-processing.js'

const DAY_MS = 24 * 60 * 60 * 1000
const MAX_TITLE_LENGTH = 120
const MAX_NOTE_LENGTH = 500
const invalidIdentityCodes = new Set([
  'auth/argument-error',
  'auth/id-token-expired',
  'auth/id-token-revoked',
  'auth/invalid-id-token',
  'auth/user-disabled',
  'auth/user-not-found',
])

function publicObjectUrl(bucketName, objectPath) {
  const encodedPath = objectPath.split('/').map(encodeURIComponent).join('/')
  return `https://storage.googleapis.com/${bucketName}/${encodedPath}`
}

function createUploadMiddleware() {
  return multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_FILE_BYTES,
      files: MAX_FILE_COUNT,
      fields: 2,
      fieldSize: 1024,
      parts: MAX_FILE_COUNT + 2,
    },
    fileFilter(_request, file, callback) {
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
        callback(new InvalidArtworkError('Only JPEG, PNG, and WebP photos are accepted.'))
        return
      }
      callback(null, true)
    },
  }).array('photos', MAX_FILE_COUNT)
}

function requireIdentity(auth) {
  return async (request, response, next) => {
    const match = /^Bearer ([^\s]+)$/.exec(request.get('authorization') ?? '')
    if (!match) {
      response.status(401).json({ error: 'Sign-in is required.' })
      return
    }

    try {
      const identity = await auth.verifyIdToken(match[1], true)
      if (
        !identity.email ||
        identity.email_verified !== true ||
        identity.firebase?.sign_in_provider !== 'google.com'
      ) {
        response.status(401).json({ error: 'A verified Google account is required.' })
        return
      }
      response.set('Cache-Control', 'private, no-store')
      request.identity = identity
      next()
    } catch (error) {
      if (invalidIdentityCodes.has(error?.code)) {
        response.status(401).json({ error: 'Sign-in token is invalid or expired.' })
        return
      }
      console.error('Firebase token verification failed', error)
      response.status(503).json({ error: 'Sign-in service is temporarily unavailable.' })
    }
  }
}

function requireRole(role, config) {
  return (request, response, next) => {
    const allowedEmail = config[`${role}Email`]
    if (request.identity.email.toLowerCase() !== allowedEmail) {
      response.status(403).json({ error: 'This account is not authorized for this action.' })
      return
    }
    next()
  }
}

async function findSubmission(db, id) {
  const snapshot = await db.collection('submissions').doc(id).get()
  if (!snapshot.exists) return null
  return { ref: snapshot.ref, ...snapshot.data() }
}

function addAudit(transaction, db, submissionId, action, identity, now) {
  const auditId = `${submissionId}_${action}`
  transaction.set(db.collection('artworkAudit').doc(auditId), {
    submissionId,
    action,
    actorUid: identity.uid,
    at: now,
  })
}

async function listSubmissions(db, status) {
  const snapshot = await db
    .collection('submissions')
    .where('status', '==', status)
    .limit(100)
    .get()
  return snapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .filter((submission) => status !== 'pending_review' || dateFromFirestore(submission.expiresAt) > new Date())
}

function dateFromFirestore(value) {
  if (value instanceof Date) return value
  if (value && typeof value.toDate === 'function') return value.toDate()
  return new Date(0)
}

function configureCors(app, galleryOrigin) {
  app.use((request, response, next) => {
    const origin = request.get('origin')
    if (origin && origin !== galleryOrigin) {
      response.status(403).json({ error: 'Origin is not allowed.' })
      return
    }

    if (origin) {
      response.set('Access-Control-Allow-Origin', galleryOrigin)
      response.set('Vary', 'Origin')
      response.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
      response.set('Access-Control-Allow-Headers', 'Authorization,Content-Type')
      response.set('Access-Control-Max-Age', '600')
    }

    if (request.method === 'OPTIONS') {
      response.status(204).end()
      return
    }
    next()
  })
}

export function createApp({
  auth,
  db,
  pendingBucket,
  approvedBucket,
  config,
  imageSanitizer = sanitizeArtworkImage,
  now = () => new Date(),
}) {
  const app = express()
  const authenticate = requireIdentity(auth)
  const upload = createUploadMiddleware()

  app.disable('x-powered-by')
  app.use((_request, response, next) => {
    response.set('X-Content-Type-Options', 'nosniff')
    response.set('X-Frame-Options', 'DENY')
    next()
  })
  configureCors(app, config.galleryOrigin)
  app.use(express.json({ limit: '16kb', strict: true }))

  app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }))

  app.get('/api/gallery', async (_request, response, next) => {
    try {
      response.set('Cache-Control', 'no-store')
      const submissions = await listSubmissions(db, 'approved')
      const items = submissions
        .sort((left, right) => right.approvedAt.toMillis() - left.approvedAt.toMillis())
        .map((submission) => ({
          id: submission.id,
          title: submission.title,
          images: submission.images.map((image) => ({
            id: image.id,
            url: publicObjectUrl(config.approvedBucketName, image.approvedObjectPath),
            width: image.width,
            height: image.height,
          })),
        }))
      response.json({ items })
    } catch (error) {
      next(error)
    }
  })

  app.post(
    '/api/submissions',
    authenticate,
    requireRole('submitter', config),
    upload,
    async (request, response, next) => {
      const title = typeof request.body.title === 'string' ? request.body.title.trim() : ''
      const note = typeof request.body.note === 'string' ? request.body.note.trim() : ''

      if (!title || title.length > MAX_TITLE_LENGTH || note.length > MAX_NOTE_LENGTH) {
        response.status(400).json({ error: 'Title or note is missing or too long.' })
        return
      }
      if (!request.files?.length || request.files.length > MAX_FILE_COUNT) {
        response.status(400).json({ error: `Choose between 1 and ${MAX_FILE_COUNT} photos.` })
        return
      }
      if (Object.keys(request.body).some((key) => !['title', 'note'].includes(key))) {
        response.status(400).json({ error: 'Unexpected submission fields.' })
        return
      }

      const submissionId = randomUUID()
      const createdAt = now()
      const expiresAt = new Date(createdAt.getTime() + 14 * DAY_MS)
      const images = []
      try {
        for (const [index, file] of request.files.entries()) {
          const sanitized = await imageSanitizer(file.buffer, file.mimetype)
          const imageId = randomUUID()
          const objectPath = `pending/${submissionId}/${imageId}.jpg`
          await pendingBucket.file(objectPath).save(sanitized.buffer, {
            resumable: false,
            metadata: {
              contentType: 'image/jpeg',
              cacheControl: 'private, no-store',
            },
          })
          images.push({
            id: imageId,
            objectPath,
            width: sanitized.width,
            height: sanitized.height,
            sizeBytes: sanitized.sizeBytes,
            mimeType: 'image/jpeg',
            order: index,
          })
        }

        const submission = {
          status: 'pending_review',
          title,
          note,
          submitterUid: request.identity.uid,
          createdAt,
          expiresAt,
          images,
        }
        await db.runTransaction(async (transaction) => {
          const ref = db.collection('submissions').doc(submissionId)
          transaction.create(ref, submission)
          addAudit(transaction, db, submissionId, 'submitted', request.identity, createdAt)
        })
        response.status(201).json({ id: submissionId, status: 'pending_review' })
      } catch (error) {
        await Promise.all(
          images.map((image) => pendingBucket.file(image.objectPath).delete({ ignoreNotFound: true })),
        ).catch((cleanupError) => console.error('Failed to clean incomplete submission objects', cleanupError))
        next(error)
      }
    },
  )

  app.get(
    '/api/review/submissions',
    authenticate,
    requireRole('reviewer', config),
    async (_request, response, next) => {
      try {
        const submissions = [
          ...await listSubmissions(db, 'pending_review'),
          ...await listSubmissions(db, 'publishing'),
        ]
        response.json({
          items: submissions.map((submission) => ({
            id: submission.id,
            status: submission.status,
            title: submission.title,
            note: submission.note,
            submittedAt: submission.createdAt.toISOString(),
            images: submission.images.map(({ id, width, height }) => ({ id, width, height })),
          })),
        })
      } catch (error) {
        next(error)
      }
    },
  )

  app.get(
    '/api/review/submissions/:submissionId/images/:imageId',
    authenticate,
    requireRole('reviewer', config),
    async (request, response, next) => {
      try {
        const submission = await findSubmission(db, request.params.submissionId)
        if (!submission || !['pending_review', 'publishing'].includes(submission.status)) {
          response.status(404).json({ error: 'Pending photo was not found.' })
          return
        }
        if (
          submission.status === 'pending_review' &&
          dateFromFirestore(submission.expiresAt) <= now()
        ) {
          response.status(410).json({ error: 'Pending photo has expired.' })
          return
        }
        const image = submission.images.find((item) => item.id === request.params.imageId)
        if (!image) {
          response.status(404).json({ error: 'Pending photo was not found.' })
          return
        }
        const [buffer] = await pendingBucket.file(image.objectPath).download()
        response
          .type('image/jpeg')
          .set('Cache-Control', 'private, no-store')
          .set('X-Content-Type-Options', 'nosniff')
          .send(buffer)
      } catch (error) {
        next(error)
      }
    },
  )

  app.post(
    '/api/review/submissions/:submissionId/decision',
    authenticate,
    requireRole('reviewer', config),
    async (request, response, next) => {
      const { decision } = request.body ?? {}
      if (decision !== 'approve' && decision !== 'reject') {
        response.status(400).json({ error: 'Decision must be approve or reject.' })
        return
      }

      const { submissionId } = request.params
      const decidedAt = now()
      try {
        const ref = db.collection('submissions').doc(submissionId)
        const initialStatus = await db.runTransaction(async (transaction) => {
          const snapshot = await transaction.get(ref)
          if (!snapshot.exists) return 'missing'
          const submission = snapshot.data()
          if (
            submission.status === 'pending_review' &&
            dateFromFirestore(submission.expiresAt) <= decidedAt
          ) {
            transaction.delete(ref)
            addAudit(transaction, db, submissionId, 'expired', request.identity, decidedAt)
            return 'expired'
          }
          if (decision === 'approve' && submission.status === 'approved') return 'approved'
          if (decision === 'reject' && submission.status === 'rejected') return 'rejected'
          if (decision === 'approve' && submission.status === 'rejected') return 'conflict'
          if (decision === 'reject' && ['publishing', 'approved'].includes(submission.status)) return 'conflict'

          if (decision === 'approve' && submission.status === 'pending_review') {
            transaction.update(ref, {
              status: 'publishing',
              approvedAt: decidedAt,
              decidedBy: request.identity.uid,
              expiresAt: null,
            })
            addAudit(transaction, db, submissionId, 'approval_started', request.identity, decidedAt)
            return 'publishing'
          }
          if (decision === 'reject' && submission.status === 'pending_review') {
            transaction.update(ref, {
              status: 'rejected',
              rejectedAt: decidedAt,
              expiresAt: new Date(decidedAt.getTime() + 14 * DAY_MS),
              decidedBy: request.identity.uid,
            })
            addAudit(transaction, db, submissionId, 'rejected', request.identity, decidedAt)
            return 'rejected'
          }
          return submission.status
        })

        if (initialStatus === 'missing') {
          response.status(404).json({ error: 'Submission was not found.' })
          return
        }
        if (initialStatus === 'expired') {
          response.status(410).json({ error: 'Submission has expired and can no longer be reviewed.' })
          return
        }
        if (initialStatus === 'conflict') {
          response.status(409).json({ error: 'Submission already has a different final decision.' })
          return
        }
        if (decision === 'approve' && initialStatus !== 'approved') {
          const submission = await findSubmission(db, submissionId)
          for (const image of submission.images) {
            const destinationPath = `approved/${submissionId}/${image.id}.jpg`
            const destination = approvedBucket.file(destinationPath)
            const [destinationExists] = await destination.exists()
            if (!destinationExists) {
              await pendingBucket.file(image.objectPath).copy(destination, {
                metadata: {
                  contentType: 'image/jpeg',
                  cacheControl: 'public, max-age=31536000, immutable',
                },
              })
            }
            await pendingBucket.file(image.objectPath).delete({ ignoreNotFound: true })
            image.approvedObjectPath = destinationPath
          }
          await db.runTransaction(async (transaction) => {
            transaction.update(ref, {
              status: 'approved',
              images: submission.images,
              expiresAt: null,
              publishedAt: now(),
            })
            addAudit(transaction, db, submissionId, 'published', request.identity, now())
          })
          response.json({ id: submissionId, status: 'approved' })
          return
        }

        if (decision === 'reject') {
          const submission = await findSubmission(db, submissionId)
          const images = []
          for (const image of submission.images) {
            const rejectedPath = `rejected/${submissionId}/${image.id}.jpg`
            const destination = pendingBucket.file(rejectedPath)
            const [destinationExists] = await destination.exists()
            if (image.objectPath !== rejectedPath && !destinationExists) {
              await pendingBucket.file(image.objectPath).copy(destination, {
                metadata: { contentType: 'image/jpeg', cacheControl: 'private, no-store' },
              })
            }
            if (image.objectPath !== rejectedPath) {
              await pendingBucket.file(image.objectPath).delete({ ignoreNotFound: true })
            }
            images.push({ ...image, objectPath: rejectedPath })
          }
          await ref.update({ images })
          response.json({ id: submissionId, status: 'rejected' })
          return
        }

        response.json({ id: submissionId, status: initialStatus })
      } catch (error) {
        next(error)
      }
    },
  )

  app.use((error, _request, response, _next) => {
    if (error instanceof InvalidArtworkError) {
      response.status(400).json({ error: error.message })
      return
    }
    if (error.type === 'entity.too.large') {
      response.status(413).json({ error: 'Request body exceeds the supported size limit.' })
      return
    }
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ error: 'Request body is invalid JSON.' })
      return
    }
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Each optimized photo must be no larger than 4 MB.'
        : `Upload exceeded the supported photo limits (${MAX_FILE_COUNT} photos maximum).`
      response.status(413).json({ error: message })
      return
    }
    console.error('Artwork API request failed', error)
    response.status(500).json({ error: 'The request could not be completed.' })
  })

  return app
}
