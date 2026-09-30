import assert from 'node:assert/strict'
import { once } from 'node:events'
import { after, before, beforeEach, describe, it } from 'node:test'
import { createServer } from 'node:http'
import sharp from 'sharp'
import { createApp } from '../src/app.js'

const config = {
  pendingBucketName: 'pending-test',
  approvedBucketName: 'approved-test',
  galleryOrigin: 'https://gallery.test',
  publicApiOrigin: 'https://api.gallery.test',
  submitterEmail: 'patrick@example.test',
  reviewerEmail: 'parent@example.test',
}

class FakeDocument {
  constructor(collection, id) {
    this.collection = collection
    this.id = id
  }

  async get() {
    const data = this.collection.records.get(this.id)
    return { exists: data !== undefined, data: () => data, ref: this }
  }

  async update(fields) {
    const current = this.collection.records.get(this.id)
    if (!current) throw new Error('Document not found')
    this.collection.records.set(this.id, { ...current, ...fields })
  }
}

class FakeQuery {
  constructor(collection, field, expected) {
    this.collection = collection
    this.field = field
    this.expected = expected
  }

  limit() {
    return this
  }

  async get() {
    const docs = [...this.collection.records.entries()]
      .filter(([, value]) => value[this.field] === this.expected)
      .map(([id, value]) => ({ id, data: () => value }))
    return { docs }
  }
}

class FakeCollection {
  constructor() {
    this.records = new Map()
  }

  doc(id) {
    return new FakeDocument(this, id)
  }

  where(field, _operator, expected) {
    return new FakeQuery(this, field, expected)
  }
}

class FakeFirestore {
  constructor() {
    this.collections = new Map()
  }

  collection(name) {
    if (!this.collections.has(name)) this.collections.set(name, new FakeCollection())
    return this.collections.get(name)
  }

  async runTransaction(callback) {
    const transaction = {
      get: (ref) => ref.get(),
      create: async (ref, value) => {
        if (ref.collection.records.has(ref.id)) throw new Error('Already exists')
        ref.collection.records.set(ref.id, value)
      },
      update: async (ref, fields) => ref.update(fields),
      delete: async (ref) => ref.collection.records.delete(ref.id),
      set: async (ref, value) => ref.collection.records.set(ref.id, value),
    }
    return callback(transaction)
  }
}

class FakeFile {
  constructor(bucket, path) {
    this.bucket = bucket
    this.path = path
  }

  async save(buffer, options) {
    this.bucket.objects.set(this.path, { buffer: Buffer.from(buffer), metadata: options.metadata })
  }

  async exists() {
    return [this.bucket.objects.has(this.path)]
  }

  async copy(destination, options) {
    const source = this.bucket.objects.get(this.path)
    if (!source) throw new Error('Object not found')
    destination.bucket.objects.set(destination.path, {
      buffer: Buffer.from(source.buffer),
      metadata: options.metadata,
    })
  }

  async delete() {
    this.bucket.objects.delete(this.path)
  }

  async download() {
    const object = this.bucket.objects.get(this.path)
    if (!object) throw new Error('Object not found')
    return [Buffer.from(object.buffer)]
  }
}

class FakeBucket {
  constructor() {
    this.objects = new Map()
  }

  file(path) {
    return new FakeFile(this, path)
  }
}

const identities = {
  'submitter-token': {
    uid: 'submitter-uid',
    email: config.submitterEmail,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
  'reviewer-token': {
    uid: 'reviewer-uid',
    email: config.reviewerEmail,
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  },
  'non-google-token': {
    uid: 'submitter-uid',
    email: config.submitterEmail,
    email_verified: true,
    firebase: { sign_in_provider: 'password' },
  },
}

let server
let origin
let db
let pendingBucket
let approvedBucket
let validJpeg

async function request(path, options = {}) {
  const headers = new Headers(options.headers)
  headers.set('Origin', config.galleryOrigin)
  return fetch(`${origin}${path}`, { ...options, headers })
}

async function submitPhoto(token = 'submitter-token', photo = validJpeg) {
  const form = new FormData()
  form.set('title', 'Test artwork')
  form.set('note', 'Private note')
  form.append('photos', new Blob([photo], { type: 'image/jpeg' }), 'phone.jpg')
  return request('/api/submissions', {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
}

before(async () => {
  validJpeg = await sharp({
    create: { width: 64, height: 48, channels: 3, background: '#cc3311' },
  }).jpeg().toBuffer()
  db = new FakeFirestore()
  pendingBucket = new FakeBucket()
  approvedBucket = new FakeBucket()
  const app = createApp({
    auth: {
      async verifyIdToken(token) {
        if (token === 'identity-service-error') {
          throw Object.assign(new Error('Identity service unavailable'), { code: 'auth/internal-error' })
        }
        const identity = identities[token]
        if (!identity) throw Object.assign(new Error('Invalid token'), { code: 'auth/invalid-id-token' })
        return identity
      },
    },
    db,
    pendingBucket,
    approvedBucket,
    config,
  })
  server = createServer(app)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  origin = `http://127.0.0.1:${server.address().port}`
})

beforeEach(() => {
  db.collections.clear()
  pendingBucket.objects.clear()
  approvedBucket.objects.clear()
})

after(async () => {
  server.close()
  await once(server, 'close')
})

describe('artwork API access and review workflow', () => {
  it('allows one explicitly configured account to hold both temporary roles', async () => {
    const originalReviewerEmail = config.reviewerEmail
    config.reviewerEmail = config.submitterEmail
    try {
      const response = await request('/api/review/submissions', {
        headers: { Authorization: 'Bearer submitter-token' },
      })
      assert.equal(response.status, 200)
    } finally {
      config.reviewerEmail = originalReviewerEmail
    }
  })

  it('rejects an unauthenticated submission', async () => {
    const response = await submitPhoto(null)
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), { error: 'Sign-in is required.' })
  })

  it('requires a verified Google identity even for the submitter email', async () => {
    const response = await submitPhoto('non-google-token')
    assert.equal(response.status, 401)
    assert.equal(db.collection('submissions').records.size, 0)
    assert.equal(pendingBucket.objects.size, 0)
  })

  it('surfaces identity-provider failures as service errors rather than invalid credentials', async () => {
    const response = await request('/api/review/submissions', {
      headers: { Authorization: 'Bearer identity-service-error' },
    })
    assert.equal(response.status, 503)
    assert.deepEqual(await response.json(), {
      error: 'Sign-in service is temporarily unavailable.',
    })
  })

  it('rejects a non-reviewer attempting approval', async () => {
    const response = await request('/api/review/submissions/not-real/decision', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer submitter-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'approve' }),
    })
    assert.equal(response.status, 403)
  })

  it('rejects an optimized photo that exceeds the server-side upload limit', async () => {
    const response = await submitPhoto(
      'submitter-token',
      Buffer.alloc(4 * 1024 * 1024 + 1),
    )
    assert.equal(response.status, 413)
    assert.match((await response.json()).error, /4 MB/)
    assert.equal(db.collection('submissions').records.size, 0)
  })

  it('rejects file content spoofed as JPEG', async () => {
    const response = await submitPhoto('submitter-token', Buffer.from('not an image'))
    assert.equal(response.status, 400)
    assert.match((await response.json()).error, /does not match|invalid|safely decoded/i)
    assert.equal(db.collection('submissions').records.size, 0)
  })

  it('lists pending submissions whose timestamps are Firestore Timestamps', async () => {
    const { id } = await (await submitPhoto()).json()
    const record = db.collection('submissions').records.get(id)
    const asTimestamp = (date) => ({ toDate: () => date, toMillis: () => date.getTime() })
    record.createdAt = asTimestamp(record.createdAt)
    record.expiresAt = asTimestamp(record.expiresAt)

    const listed = await request('/api/review/submissions', {
      headers: { Authorization: 'Bearer reviewer-token' },
    })
    assert.equal(listed.status, 200)
    const { items } = await listed.json()
    assert.equal(items.length, 1)
    assert.match(items[0].submittedAt, /^\d{4}-\d{2}-\d{2}T/)
  })

  it('does not list or approve an expired pending submission', async () => {
    const response = await submitPhoto()
    const { id } = await response.json()
    db.collection('submissions').records.get(id).expiresAt = new Date(Date.now() - 1000)

    const listed = await request('/api/review/submissions', {
      headers: { Authorization: 'Bearer reviewer-token' },
    })
    assert.deepEqual(await listed.json(), { items: [] })

    const expiredImageId = db.collection('submissions').records.get(id).images[0].id
    const preview = await request(`/api/review/submissions/${id}/images/${expiredImageId}`, {
      headers: { Authorization: 'Bearer reviewer-token' },
    })
    assert.equal(preview.status, 410)

    const decision = await request(`/api/review/submissions/${id}/decision`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer reviewer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'approve' }),
    })
    assert.equal(decision.status, 410)
    assert.equal(db.collection('submissions').records.has(id), false)
    assert.equal(approvedBucket.objects.size, 0)
  })

  it('keeps pending media private and absent from the public gallery', async () => {
    const response = await submitPhoto()
    assert.equal(response.status, 201)
    const { id } = await response.json()
    assert.equal(pendingBucket.objects.size, 1)
    assert.equal(approvedBucket.objects.size, 0)
    const gallery = await request('/api/gallery')
    assert.deepEqual(await gallery.json(), { items: [] })

    const pendingImage = [...db.collection('submissions').records.get(id).images][0]
    const access = await request(`/api/review/submissions/${id}/images/${pendingImage.id}`)
    assert.equal(access.status, 401)
    const publicAccess = await request(`/api/gallery/${id}/images/${pendingImage.id}`)
    assert.equal(publicAccess.status, 404)
  })

  it('publishes only after reviewer approval and approval is idempotent', async () => {
    const submitted = await submitPhoto()
    const { id } = await submitted.json()
    const reviewerHeaders = { Authorization: 'Bearer reviewer-token', 'Content-Type': 'application/json' }
    const decisionUrl = `/api/review/submissions/${id}/decision`

    const approved = await request(decisionUrl, {
      method: 'POST',
      headers: reviewerHeaders,
      body: JSON.stringify({ decision: 'approve' }),
    })
    assert.equal(approved.status, 200)
    assert.equal((await approved.json()).status, 'approved')
    assert.equal(pendingBucket.objects.size, 0)
    assert.equal(approvedBucket.objects.size, 1)

    const gallery = await request('/api/gallery')
    const { items } = await gallery.json()
    assert.equal(items.length, 1)
    assert.equal(items[0].id, id)
    assert.equal(
      items[0].images[0].url,
      `https://api.gallery.test/api/gallery/${id}/images/${items[0].images[0].id}`,
    )
    const imageUrl = `/api/gallery/${id}/images/${items[0].images[0].id}`
    const publicImage = await request(imageUrl)
    assert.equal(publicImage.status, 200)
    assert.equal(publicImage.headers.get('content-type'), 'image/jpeg')
    assert.match(publicImage.headers.get('cache-control'), /public.*max-age=3600/)

    const otherSubmission = await submitPhoto()
    const { id: rejectedSubmissionId } = await otherSubmission.json()
    const rejectedImageId = db.collection('submissions')
      .records.get(rejectedSubmissionId).images[0].id
    await request(`/api/review/submissions/${rejectedSubmissionId}/decision`, {
      method: 'POST',
      headers: reviewerHeaders,
      body: JSON.stringify({ decision: 'reject' }),
    })
    const rejectedPublicImage = await request(
      `/api/gallery/${rejectedSubmissionId}/images/${rejectedImageId}`,
    )
    assert.equal(rejectedPublicImage.status, 404)

    const repeated = await request(decisionUrl, {
      method: 'POST',
      headers: reviewerHeaders,
      body: JSON.stringify({ decision: 'approve' }),
    })
    assert.equal(repeated.status, 200)
    assert.equal(approvedBucket.objects.size, 1)
    assert.equal(db.collection('artworkAudit').records.size, 5)
  })

  it('moves rejected photos to private rejected storage and keeps them out of the gallery', async () => {
    const response = await submitPhoto()
    const { id } = await response.json()
    const decision = await request(`/api/review/submissions/${id}/decision`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer reviewer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'reject' }),
    })
    assert.equal(decision.status, 200)
    assert.equal(pendingBucket.objects.size, 1)
    assert.match([...pendingBucket.objects.keys()][0], /^rejected\//)
    assert.equal(approvedBucket.objects.size, 0)
    const document = db.collection('submissions').records.get(id)
    assert.equal(document.status, 'rejected')
    assert.ok(document.expiresAt instanceof Date)
    assert.ok(document.expiresAt.getTime() > Date.now() + 13 * 24 * 60 * 60 * 1000)
    assert.deepEqual(await (await request('/api/gallery')).json(), { items: [] })

    const repeated = await request(`/api/review/submissions/${id}/decision`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer reviewer-token',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ decision: 'reject' }),
    })
    assert.equal(repeated.status, 200)
    assert.equal(pendingBucket.objects.size, 1)
    assert.equal(db.collection('artworkAudit').records.size, 2)
  })

  it('rejects requests from an unapproved browser origin', async () => {
    const response = await fetch(`${origin}/api/gallery`, {
      headers: { Origin: 'https://attacker.invalid' },
    })
    assert.equal(response.status, 403)
  })
})
