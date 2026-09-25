'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { cast } from '../cast.ts'

import { createFilesClient, FilesRequestError } from '../../src/client/files/files-client.ts'

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function client(): ReturnType<typeof createFilesClient> {
  return createFilesClient(cast<typeof fetch>(fetchMock), '/api')
}

beforeEach(() => {
  fetchMock = vi.fn()
})

describe('tree', () => {
  it('requests the file listing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tree: [] }))

    await client().tree()

    expect(fetchMock).toHaveBeenCalledWith('/api/files', expect.objectContaining({ method: 'GET' }))
  })

  it('returns the parsed tree', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ tree: [{ name: 'a.md', path: 'a.md', kind: 'document' }] }))

    await expect(client().tree()).resolves.toStrictEqual([{ name: 'a.md', path: 'a.md', kind: 'document' }])
  })

  it('throws with the status when the server refuses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    await expect(client().tree()).rejects.toMatchObject({ status: 500 })
  })

  it('throws a named error, so a caller can tell it from a parse failure', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    await expect(client().tree()).rejects.toThrow(FilesRequestError)
  })

  it('returns an empty tree rather than throwing on an unexpected payload', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ surprise: true }))

    await expect(client().tree()).resolves.toStrictEqual([])
  })
})

describe('trash', () => {
  it('requests the trash listing', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ entries: [] }))

    await client().trash()

    expect(fetchMock).toHaveBeenCalledWith('/api/trash', expect.objectContaining({ method: 'GET' }))
  })

  it('returns the parsed entries', async () => {
    const entry = { id: 'a', originalPath: 'notes.md', kind: 'document', deletedAt: '2026-01-01T00:00:00.000Z' }
    fetchMock.mockResolvedValue(jsonResponse({ entries: [entry] }))

    await expect(client().trash()).resolves.toStrictEqual([entry])
  })

  it('throws when the server refuses', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 503))

    await expect(client().trash()).rejects.toThrow(FilesRequestError)
  })
})

describe('defaults', () => {
  it('uses globalThis.fetch and the /api base url when none are given', async () => {
    const globalFetch = vi.fn().mockResolvedValue(jsonResponse({ tree: [] }))
    vi.stubGlobal('fetch', globalFetch)

    await createFilesClient().tree()

    expect(globalFetch).toHaveBeenCalledWith('/api/files', expect.objectContaining({ method: 'GET' }))
    vi.unstubAllGlobals()
  })
})

describe('mutations', () => {
  it('creates a document by posting its path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ path: 'a.md' }, 201))

    await client().createDocument('journal/a.md')

    expect(fetchMock).toHaveBeenCalledWith('/api/files/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'journal/a.md' }),
    })
  })

  it('creates a folder by posting its path', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ path: 'journal/index.md' }, 201))

    await client().createFolder('journal')

    expect(fetchMock).toHaveBeenCalledWith('/api/files/folders', expect.objectContaining({ method: 'POST' }))
  })

  it('uploads a file as multipart and reports where it landed', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ path: 'journal/p.png' }, 201))

    await expect(client().upload('journal', new File(['x'], 'p.png'))).resolves.toBe('journal/p.png')
    expect(fetchMock).toHaveBeenCalledWith('/api/files/uploads', expect.objectContaining({ method: 'POST' }))
  })

  it('reports no path when the upload response carries none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ unexpected: true }, 201))

    await expect(client().upload('', new File(['x'], 'p.png'))).resolves.toBe('')
  })

  it('deletes through the entries route, which moves to the trash', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ trashId: 'abc' }))

    await client().remove('journal/a.md')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/files/entries/journal/a.md',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('encodes each path segment of a delete without encoding the separators', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ trashId: 'abc' }))

    await client().remove('my folder/a b.md')

    expect(fetchMock).toHaveBeenCalledWith('/api/files/entries/my%20folder/a%20b.md', expect.anything())
  })

  it('restores a trash entry', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ path: 'a.md' }))

    await client().restore('abc')

    expect(fetchMock).toHaveBeenCalledWith('/api/trash/abc/restore', expect.objectContaining({ method: 'POST' }))
  })

  it('purges a trash entry', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await client().purge('abc')

    expect(fetchMock).toHaveBeenCalledWith('/api/trash/abc', expect.objectContaining({ method: 'DELETE' }))
  })
})

describe('failures', () => {
  it('carries the code, so a caller can tell a fixable name from a real fault', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'Already exists', code: 'ALREADY_EXISTS' }, 409))

    await expect(client().createDocument('a.md')).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_EXISTS',
      message: 'Already exists',
    })
  })

  it('carries the colliding paths of a refused overwrite', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Would overwrite', code: 'WOULD_OVERWRITE', paths: ['a.md', 'b.md'] }, 409),
    )

    await expect(client().createDocument('a.md')).rejects.toMatchObject({ paths: ['a.md', 'b.md'] })
  })

  it('keeps only the strings from a malformed paths list', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ code: 'WOULD_OVERWRITE', paths: ['a.md', 42, null] }, 409))

    await expect(client().createDocument('a.md')).rejects.toMatchObject({ paths: ['a.md'] })
  })

  it('reports an unknown code when the body carries none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: 'boom' }, 500))

    await expect(client().createDocument('a.md')).rejects.toMatchObject({ code: 'UNKNOWN', paths: [] })
  })

  it('falls back to the status text when the body is not json at all', async () => {
    fetchMock.mockResolvedValue(new Response('kaboom', { status: 502, statusText: 'Bad Gateway' }))

    await expect(client().createDocument('a.md')).rejects.toMatchObject({ code: 'UNKNOWN', message: 'Bad Gateway' })
  })

  it('falls back to the status text when the json body is not an object', async () => {
    fetchMock.mockResolvedValue(jsonResponse('surprise', 500))

    await expect(client().createDocument('a.md')).rejects.toMatchObject({ code: 'UNKNOWN' })
  })
})

describe('archiveUrlFor', () => {
  it('addresses the whole store with no query', async () => {
    const { archiveUrlFor } = await import('../../src/client/files/files-client.ts')

    expect(archiveUrlFor('')).toBe('/api/files/archive')
  })

  it('addresses a subtree by query, encoding it', async () => {
    const { archiveUrlFor } = await import('../../src/client/files/files-client.ts')

    expect(archiveUrlFor('my folder/2026')).toBe('/api/files/archive?path=my%20folder%2F2026')
  })
})

describe('move', () => {
  it('posts the source and the destination', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))

    await client().move('notes.md', 'archive/notes.md')

    expect(fetchMock).toHaveBeenCalledWith('/api/files/moves', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: 'notes.md', to: 'archive/notes.md' }),
    })
  })

  it('surfaces the colliding paths of a refused overwrite', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Would overwrite', code: 'WOULD_OVERWRITE', paths: ['b/a.md'] }, 409),
    )

    await expect(client().move('a.md', 'b/a.md')).rejects.toMatchObject({
      code: 'WOULD_OVERWRITE',
      paths: ['b/a.md'],
    })
  })
})

describe('move', () => {
  it('reports the paths whose links were repaired', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rewritten: ['a.md', 'b.md'], failed: [] }))

    await expect(client().move('x.md', 'y.md')).resolves.toStrictEqual(['a.md', 'b.md'])
  })

  it.each([
    ['a body with no rewritten list', {}],
    ['a rewritten list that is not an array', { rewritten: 'a.md' }],
  ])('reports nothing for %s', async (_label, body) => {
    fetchMock.mockResolvedValue(jsonResponse(body))

    await expect(client().move('x.md', 'y.md')).resolves.toStrictEqual([])
  })

  it('drops entries that are not strings', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rewritten: ['a.md', 7, null] }))

    await expect(client().move('x.md', 'y.md')).resolves.toStrictEqual(['a.md'])
  })

  it('reports nothing when the body is not JSON at all', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 200 }))

    await expect(client().move('x.md', 'y.md')).resolves.toStrictEqual([])
  })
})
