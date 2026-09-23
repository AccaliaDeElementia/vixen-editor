'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocumentClient, DocumentRequestError } from '../../src/client/editor/document-client.ts'

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function textResponse(body: string, status = 200, etag = '"e1"'): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/markdown', etag } })
}

function noContent(etag = '"e2"'): Response {
  return new Response(null, { status: 204, headers: { etag } })
}

function client(): ReturnType<typeof createDocumentClient> {
  return createDocumentClient(fetchMock as unknown as typeof fetch, '/api')
}

beforeEach(() => {
  fetchMock = vi.fn()
})

describe('list', () => {
  it('requests the collection endpoint', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: [] }))

    await client().list()

    expect(fetchMock).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ method: 'GET' }))
  })

  it('returns the document ids', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ documents: ['a.md', 'b.md'] }))

    await expect(client().list()).resolves.toStrictEqual(['a.md', 'b.md'])
  })

  it('throws when the server reports an error', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    await expect(client().list()).rejects.toThrow(DocumentRequestError)
  })

  it('returns an empty list when the payload has no documents array', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }))

    await expect(client().list()).resolves.toStrictEqual([])
  })

  it('returns an empty list when the payload is not an object', async () => {
    fetchMock.mockResolvedValue(jsonResponse('surprise'))

    await expect(client().list()).resolves.toStrictEqual([])
  })
})

describe('read', () => {
  it('requests the document endpoint', async () => {
    fetchMock.mockResolvedValue(textResponse('# hi'))

    await client().read('notes.md')

    expect(fetchMock).toHaveBeenCalledWith('/api/documents/notes.md', expect.objectContaining({ method: 'GET' }))
  })

  it('encodes each path segment but keeps the separators', async () => {
    fetchMock.mockResolvedValue(textResponse(''))

    await client().read('journal/2026/a b.md')

    expect(fetchMock).toHaveBeenCalledWith('/api/documents/journal/2026/a%20b.md', expect.anything())
  })

  it('returns the raw markdown', async () => {
    fetchMock.mockResolvedValue(textResponse('# hi'))

    await expect(client().read('notes.md')).resolves.toMatchObject({ content: '# hi' })
  })

  it('returns the etag the server sent, which the next save must quote back', async () => {
    fetchMock.mockResolvedValue(textResponse('# hi', 200, '"abc"'))

    await expect(client().read('notes.md')).resolves.toMatchObject({ etag: '"abc"' })
  })

  it('reports an empty etag when the response carries none, so the save fails loudly', async () => {
    fetchMock.mockResolvedValue(new Response('# hi', { status: 200 }))

    await expect(client().read('notes.md')).resolves.toMatchObject({ etag: '' })
  })

  it('throws with the status code on 404', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Document not found' }, 404))

    await expect(client().read('missing.md')).rejects.toMatchObject({ status: 404 })
  })

  it('surfaces the server error message', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Document not found' }, 404))

    await expect(client().read('missing.md')).rejects.toThrow(/Document not found/)
  })

  it('falls back to the status text when the body is not json', async () => {
    fetchMock.mockResolvedValue(new Response('kaboom', { status: 503 }))

    await expect(client().read('notes.md')).rejects.toThrow(DocumentRequestError)
  })

  it('falls back to the status text when the json body has no error field', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'nope' }, 500))

    await expect(client().read('notes.md')).rejects.toMatchObject({ status: 500 })
  })

  it('falls back to the status text when the json body is not an object', async () => {
    fetchMock.mockResolvedValue(jsonResponse(null, 500))

    await expect(client().read('notes.md')).rejects.toMatchObject({ status: 500 })
  })
})

describe('save', () => {
  it('sends the content as json with the etag as If-Match', async () => {
    fetchMock.mockResolvedValue(noContent())

    await client().save('notes.md', '# body', '"abc"')

    expect(fetchMock).toHaveBeenCalledWith('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json', 'if-match': '"abc"' },
      body: JSON.stringify({ content: '# body' }),
    })
  })

  it('returns the new etag, so the next save needs no re-read', async () => {
    fetchMock.mockResolvedValue(noContent('"next"'))

    await expect(client().save('notes.md', 'x', '"abc"')).resolves.toBe('"next"')
  })

  it('throws on a rejected write', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid path' }, 400))

    await expect(client().save('bad.zip', 'x', '"abc"')).rejects.toThrow(DocumentRequestError)
  })

  it('surfaces a stale-etag conflict with its status, so a caller can react to it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Document changed', code: 'CONFLICT' }, 412))

    await expect(client().save('notes.md', 'x', '"stale"')).rejects.toMatchObject({ status: 412 })
  })
})

describe('create', () => {
  it('posts to the files endpoint rather than putting to the document', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ path: 'notes.md', etag: '"new"' }, 201))

    await client().create('notes.md', '# body')

    expect(fetchMock).toHaveBeenCalledWith('/api/files/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'notes.md', content: '# body' }),
    })
  })

  it('returns the etag of the created document', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ path: 'notes.md', etag: '"new"' }, 201))

    await expect(client().create('notes.md', 'x')).resolves.toBe('"new"')
  })

  it('reports an empty etag when the response carries none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ path: 'notes.md' }, 201))

    await expect(client().create('notes.md', 'x')).resolves.toBe('')
  })

  it('reports an empty etag when the response is not an object', async () => {
    fetchMock.mockResolvedValue(jsonResponse('surprise', 201))

    await expect(client().create('notes.md', 'x')).resolves.toBe('')
  })

  it('throws when the document already exists', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Already exists', code: 'ALREADY_EXISTS' }, 409))

    await expect(client().create('notes.md', 'x')).rejects.toMatchObject({ status: 409 })
  })
})

describe('retrying a busy write', () => {
  it('retries a save once when the write lock reports contention', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Busy', code: 'BUSY' }, 503))
      .mockResolvedValueOnce(noContent('"after-retry"'))

    await expect(client().save('notes.md', 'x', '"abc"')).resolves.toBe('"after-retry"')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('gives up after one retry rather than hammering a busy server', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Busy', code: 'BUSY' }, 503))

    await expect(client().save('notes.md', 'x', '"abc"')).rejects.toMatchObject({ status: 503 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('retries a create as well, since creating also takes the lock', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'Busy', code: 'BUSY' }, 503))
      .mockResolvedValueOnce(jsonResponse({ path: 'notes.md', etag: '"new"' }, 201))

    await expect(client().create('notes.md', 'x')).resolves.toBe('"new"')
  })

  it('retries a delete as well', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Busy' }, 503)).mockResolvedValueOnce(noContent())

    await expect(client().remove('notes.md')).resolves.toBeUndefined()
  })

  it('does not retry a successful write', async () => {
    fetchMock.mockResolvedValue(noContent())

    await client().save('notes.md', 'x', '"abc"')

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})

describe('remove', () => {
  it('sends a DELETE', async () => {
    fetchMock.mockResolvedValue(noContent())

    await client().remove('notes.md')

    expect(fetchMock).toHaveBeenCalledWith('/api/files/entries/notes.md', expect.objectContaining({ method: 'DELETE' }))
  })

  it('throws on a rejected delete', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Document not found' }, 404))

    await expect(client().remove('missing.md')).rejects.toThrow(DocumentRequestError)
  })
})

describe('defaults', () => {
  it('uses globalThis.fetch and the /api base url when none are given', async () => {
    const globalFetch = vi.fn().mockResolvedValue(jsonResponse({ documents: [] }))
    vi.stubGlobal('fetch', globalFetch)

    await createDocumentClient().list()

    expect(globalFetch).toHaveBeenCalledWith('/api/documents', expect.objectContaining({ method: 'GET' }))
    vi.unstubAllGlobals()
  })
})
