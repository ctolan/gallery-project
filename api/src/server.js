import { pathToFileURL } from 'node:url'
import { initializeApp, applicationDefault, getApps } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { createApp } from './app.js'

function readConfig(environment = process.env) {
  const required = [
    'GCP_PROJECT_ID',
    'PENDING_BUCKET',
    'APPROVED_BUCKET',
    'ARTWORK_DATABASE_ID',
    'GALLERY_ORIGIN',
    'PUBLIC_API_ORIGIN',
    'SUBMITTER_EMAIL',
    'REVIEWER_EMAIL',
  ]
  const missing = required.filter((key) => !environment[key])
  if (missing.length) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`)
  }

  const galleryOrigin = new URL(environment.GALLERY_ORIGIN).origin
  if (galleryOrigin !== environment.GALLERY_ORIGIN || !galleryOrigin.startsWith('https://')) {
    throw new Error('GALLERY_ORIGIN must be an HTTPS origin without a path or trailing slash.')
  }

  const publicApiOrigin = new URL(environment.PUBLIC_API_ORIGIN).origin
  if (publicApiOrigin !== environment.PUBLIC_API_ORIGIN || !publicApiOrigin.startsWith('https://')) {
    throw new Error('PUBLIC_API_ORIGIN must be an HTTPS origin without a path or trailing slash.')
  }

  const submitterEmail = environment.SUBMITTER_EMAIL.trim().toLowerCase()
  const reviewerEmail = environment.REVIEWER_EMAIL.trim().toLowerCase()
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!validEmail.test(submitterEmail) || !validEmail.test(reviewerEmail)) {
    throw new Error('Submitter and reviewer must be valid email addresses.')
  }

  if (environment.PENDING_BUCKET === environment.APPROVED_BUCKET) {
    throw new Error('Pending and approved media must use separate buckets.')
  }

  if (!/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(environment.ARTWORK_DATABASE_ID)) {
    throw new Error('ARTWORK_DATABASE_ID must be a valid named Firestore database ID.')
  }

  const port = Number(environment.PORT || 8080)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port.')
  }

  return {
    projectId: environment.GCP_PROJECT_ID,
    pendingBucketName: environment.PENDING_BUCKET,
    approvedBucketName: environment.APPROVED_BUCKET,
    artworkDatabaseId: environment.ARTWORK_DATABASE_ID,
    galleryOrigin,
    publicApiOrigin,
    submitterEmail,
    reviewerEmail,
    port,
  }
}

export function startServer(environment = process.env) {
  const config = readConfig(environment)
  const firebaseApp = getApps().find((app) => app.name === 'artwork-api')
    ?? initializeApp(
      { credential: applicationDefault(), projectId: config.projectId, storageBucket: config.pendingBucketName },
      'artwork-api',
    )
  const app = createApp({
    auth: getAuth(firebaseApp),
    db: getFirestore(firebaseApp, config.artworkDatabaseId),
    pendingBucket: getStorage(firebaseApp).bucket(config.pendingBucketName),
    approvedBucket: getStorage(firebaseApp).bucket(config.approvedBucketName),
    config,
  })

  return app.listen(config.port, '0.0.0.0', () => {
    console.log(`Artwork API listening on port ${config.port}`)
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    startServer()
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
