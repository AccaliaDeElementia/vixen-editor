'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import type { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { given } from '../../conditions.ts'
import { refusalOf } from './refusals.ts'
import { buildApp } from '../../../src/server/app.ts'
import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import { createWriteLock } from '../../../src/server/storage/lock.ts'
import { failingStore } from '../failing-store.ts'
import { gate } from '../gate.ts'

let root = ''
let store: DocumentStore = createFsDocumentStore('')
let app: Hono = buildApp({ store })

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-routes-'))
  store = createFsDocumentStore(root)
  app = buildApp({ store })
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

async function put(id: string, content: string, ifMatch = '"any"'): Promise<Response> {
  return await app.request(`/api/documents/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'if-match': ifMatch },
    body: JSON.stringify({ content }),
  })
}

async function seed(id: string, content: string): Promise<string> {
  return await store.createDocument(id, content)
}

describe('GET /api/health', () => {
  it('reports ok', async () => {
    const res = await app.request('/api/health')

    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(res.json()).resolves.toStrictEqual({ status: 'ok' })
  })
})

describe('GET /api/documents', () => {
  it('returns an empty list initially', async () => {
    const res = await app.request('/api/documents')

    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(res.json()).resolves.toStrictEqual({ documents: [] })
  })

  it('lists stored documents', async () => {
    await store.createDocument('b.md', 'x')
    await store.createDocument('a.md', 'x')

    const res = await app.request('/api/documents')

    await expect(res.json()).resolves.toStrictEqual({ documents: ['a.md', 'b.md'] })
  })
})

describe('GET /api/documents/:id', () => {
  it('returns the document content as markdown', async () => {
    await store.createDocument('notes.md', '# hello')

    const res = await app.request('/api/documents/notes.md')

    given(() => {
      expect(res.status).toBe(200)
    })

    expect({ contentType: res.headers.get('content-type'), body: await res.text() }).toStrictEqual({
      contentType: 'text/markdown; charset=utf-8',
      body: '# hello',
    })
  })

  it('carries an etag the client can save against', async () => {
    const etag = await store.createDocument('notes.md', '# hello')

    const res = await app.request('/api/documents/notes.md')

    expect(res.headers.get('etag')).toBe(etag)
  })

  it('changes the etag when the content changes', async () => {
    const etag = await store.createDocument('notes.md', '# hello')
    await store.updateDocument('notes.md', '# changed', etag)

    const res = await app.request('/api/documents/notes.md')

    expect(res.headers.get('etag')).not.toBe(etag)
  })

  it.each([
    ['a space', 'Finding Toy.md'],
    ['an apostrophe', "Rachel's notes.md"],
    ['an accented letter', 'caf\u00e9.md'],
    ['CJK characters', '\u65e5\u672c\u8a9e.md'],
    ['an emoji', 'party \u{1F389}.md'],
  ])('serves a document whose name has %s', async (_label, name) => {
    await fs.writeFile(path.join(root, name), '# hello')

    const res = await app.request(`/api/documents/${encodeURIComponent(name)}`)

    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(res.text()).resolves.toBe('# hello')
  })

  it('returns a nested document', async () => {
    await store.createDocument('journal/2026/september.md', 'entry')

    const res = await app.request('/api/documents/journal/2026/september.md')

    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(res.text()).resolves.toBe('entry')
  })

  it('returns 404 for a missing document', async () => {
    const res = await app.request('/api/documents/missing.md')

    given(() => {
      expect(res.status).toBe(404)
    })

    await expect(res.json()).resolves.toStrictEqual({ error: 'Document not found', code: 'NOT_FOUND' })
  })

  it('returns 400 for an invalid id', async () => {
    const res = await app.request('/api/documents/notes.zip')

    expect(res.status).toBe(400)
  })

  it('returns 400 rather than 404 for a traversal attempt', async () => {
    const res = await app.request('/api/documents/..%2F..%2Fetc%2Fpasswd.md')

    expect(res.status).toBe(400)
  })

  it('does not disclose the document root in an error response', async () => {
    const res = await app.request('/api/documents/notes.zip')

    await expect(res.text()).resolves.not.toContain(root)
  })
})

describe('PUT /api/documents/:id', () => {
  it('replaces the content and returns 204', async () => {
    const etag = await seed('notes.md', 'first')

    const res = await put('notes.md', '# replaced', etag)

    expect({ status: res.status, stored: await store.read('notes.md') }).toStrictEqual({
      status: 204,
      stored: '# replaced',
    })
  })

  it('round-trips a write then a read', async () => {
    const etag = await seed('notes.md', 'first')
    await put('notes.md', '# round trip', etag)

    const res = await app.request('/api/documents/notes.md')

    await expect(res.text()).resolves.toBe('# round trip')
  })

  it('returns the new etag, so a second save needs no re-read', async () => {
    const etag = await seed('notes.md', 'first')

    const res = await put('notes.md', 'second', etag)
    const next = res.headers.get('etag') ?? ''

    const third = await put('notes.md', 'third', next)

    expect({ status: third.status, stored: await store.read('notes.md') }).toStrictEqual({
      status: 204,
      stored: 'third',
    })
  })

  it('rejects a stale etag with 412 rather than clobbering the newer content', async () => {
    const stale = await seed('notes.md', 'first')
    await put('notes.md', 'theirs', stale)

    const res = await put('notes.md', 'mine', stale)

    expect({ refusal: await refusalOf(res), stored: await store.read('notes.md') }).toStrictEqual({
      refusal: { status: 412, code: 'CONFLICT' },
      stored: 'theirs',
    })
  })

  it('demands If-Match rather than silently overwriting, so a forgetful client fails loudly', async () => {
    await seed('notes.md', 'first')

    const res = await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'mine' }),
    })

    expect({ refusal: await refusalOf(res), stored: await store.read('notes.md') }).toStrictEqual({
      refusal: { status: 428, code: 'PRECONDITION_REQUIRED' },
      stored: 'first',
    })
  })

  it('refuses to create a document, which is what the create endpoint is for', async () => {
    const res = await put('absent.md', '# new')

    await expect(refusalOf(res)).resolves.toStrictEqual({ status: 404, code: 'NOT_FOUND' })
  })

  it.each([
    ['empty content', ''],
    ['whitespace-only content', '   \n\t '],
  ])('rejects %s with 422', async (_label, content) => {
    const etag = await seed('notes.md', 'first')

    const res = await put('notes.md', content, etag)

    expect({ refusal: await refusalOf(res), stored: await store.read('notes.md') }).toStrictEqual({
      refusal: { status: 422, code: 'EMPTY_CONTENT' },
      stored: 'first',
    })
  })

  it('returns 400 for an invalid id', async () => {
    expect((await put('notes.zip', 'x')).status).toBe(400)
  })

  it('returns 400 for an encoded traversal attempt', async () => {
    expect((await put('..%2F..%2Fescape.md', 'x')).status).toBe(400)
  })

  it('returns 404 for a literal traversal, which the URL parser normalises away', async () => {
    // The WHATWG URL parser collapses `/api/documents/../escape.md` to
    // `/api/escape.md` before routing, so it never reaches the handler.
    expect((await put('../escape.md', 'x')).status).toBe(404)
  })

  it('returns 400 when content is missing', async () => {
    const res = await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 when content is not a string', async () => {
    const res = await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 42 }),
    })

    expect(res.status).toBe(400)
  })

  it('returns 400 for a malformed JSON body', async () => {
    const res = await app.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: 'not json',
    })

    expect(res.status).toBe(400)
  })
})

describe('unknown routes', () => {
  it('returns 404 for an unknown api route', async () => {
    const res = await app.request('/api/nope')

    expect(res.status).toBe(404)
  })
})

describe('unexpected storage faults', () => {
  it('surfaces an unrecognised storage error as 500, not as 400 or 404', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/notes.md')

    expect(res.status).toBe(500)
  })

  it('propagates an unrecognised error from a write', async () => {
    const res = await buildApp({ store: failingStore() }).request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': '"any"' },
      body: JSON.stringify({ content: 'x' }),
    })

    expect(res.status).toBe(500)
  })
})

describe('write contention', () => {
  const IMPATIENT_MS = 5

  interface Held {
    release: () => void
    occupied: Promise<void>
  }

  // Holds the lock the store was built with, so a request queues behind it and
  // gives up without needing a slow filesystem to simulate load.
  function occupy(lock: ReturnType<typeof createWriteLock>): Held {
    const until = gate()
    const started = gate()

    void lock.run(async () => {
      started.open()
      await until.hold()
    })

    return { release: until.open, occupied: started.hold() }
  }

  it('answers a save that cannot take the lock with 503 BUSY', async () => {
    const lock = createWriteLock(IMPATIENT_MS)
    const busy = buildApp({ store: createFsDocumentStore(root, lock) })
    const held = occupy(lock)
    await held.occupied

    const res = await busy.request('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': '"any"' },
      body: JSON.stringify({ content: 'mine' }),
    })

    const refusal = { ...(await refusalOf(res)), retryAfter: res.headers.get('retry-after') }

    expect(refusal).toStrictEqual({ status: 503, code: 'BUSY', retryAfter: '1' })
    held.release()
  })

  it('serves a read while a write holds the lock, because reads never queue', async () => {
    const lock = createWriteLock(IMPATIENT_MS)
    const contended = createFsDocumentStore(root, lock)
    await contended.createDocument('notes.md', '# readable')
    const busy = buildApp({ store: contended })
    const held = occupy(lock)
    await held.occupied

    const res = await busy.request('/api/documents/notes.md')

    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(res.text()).resolves.toBe('# readable')
    held.release()
  })
})

describe('a conditional GET', () => {
  async function conditionalGet(id: string, etag: string): Promise<Response> {
    return await app.request(`/api/documents/${id}`, { headers: { 'if-none-match': etag } })
  }

  it('answers 304 when the token still matches, so a check costs no body', async () => {
    const etag = await store.createDocument('notes.md', '# hello')

    const res = await conditionalGet('notes.md', etag)

    given(() => {
      expect(res.status).toBe(304)
    })

    await expect(res.text()).resolves.toBe('')
  })

  it('still carries the token on a 304, because a client may have lost it', async () => {
    const etag = await store.createDocument('notes.md', '# hello')

    expect((await conditionalGet('notes.md', etag)).headers.get('etag')).toBe(etag)
  })

  it('returns the new content when the document has moved on', async () => {
    const stale = await store.createDocument('notes.md', '# hello')
    await store.updateDocument('notes.md', '# changed', stale)

    const res = await conditionalGet('notes.md', stale)

    given(() => {
      expect(res.status).toBe(200)
    })

    await expect(res.text()).resolves.toBe('# changed')
  })

  it('carries the new token with the new content, which is what a resolution needs', async () => {
    const stale = await store.createDocument('notes.md', '# hello')
    const fresh = await store.updateDocument('notes.md', '# changed', stale)

    expect((await conditionalGet('notes.md', stale)).headers.get('etag')).toBe(fresh)
  })

  it('answers in full when no token is offered at all', async () => {
    await store.createDocument('notes.md', '# hello')

    const res = await app.request('/api/documents/notes.md')

    expect(res.status).toBe(200)
  })

  it('answers 404 for a document that is gone, rather than 304', async () => {
    const etag = await store.createDocument('notes.md', '# hello')
    await store.trash('notes.md')

    expect((await conditionalGet('notes.md', etag)).status).toBe(404)
  })

  it('honours a weak comparison, which is what If-None-Match specifies', async () => {
    const etag = await store.createDocument('notes.md', '# hello')

    expect((await conditionalGet('notes.md', `W/${etag}`)).status).toBe(304)
  })

  it('accepts a list of tokens, matching if any of them is current', async () => {
    const etag = await store.createDocument('notes.md', '# hello')

    expect((await conditionalGet('notes.md', `"other", ${etag}`)).status).toBe(304)
  })

  it('answers in full when none of the offered tokens is current', async () => {
    await store.createDocument('notes.md', '# hello')

    expect((await conditionalGet('notes.md', '"one", "two"')).status).toBe(200)
  })

  it('answers 304 for the wildcard, which means any current version', async () => {
    await store.createDocument('notes.md', '# hello')

    expect((await conditionalGet('notes.md', '*')).status).toBe(304)
  })
})
