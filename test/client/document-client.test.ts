'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDocumentClient, DocumentRequestError } from '../../src/client/editor/document-client.ts'

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function textResponse(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/markdown' } })
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

    await expect(client().read('notes.md')).resolves.toBe('# hi')
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
  it('sends the content as json', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await client().save('notes.md', '# body')

    expect(fetchMock).toHaveBeenCalledWith('/api/documents/notes.md', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: '# body' }),
    })
  })

  it('resolves on 204', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await expect(client().save('notes.md', 'x')).resolves.toBeUndefined()
  })

  it('throws on a rejected write', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Invalid document id' }, 400))

    await expect(client().save('bad.txt', 'x')).rejects.toThrow(DocumentRequestError)
  })
})

describe('remove', () => {
  it('sends a DELETE', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await client().remove('notes.md')

    expect(fetchMock).toHaveBeenCalledWith('/api/documents/notes.md', expect.objectContaining({ method: 'DELETE' }))
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
