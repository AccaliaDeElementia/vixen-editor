'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createFilesClient, FilesRequestError } from '../../src/client/files/files-client.ts'

let fetchMock: ReturnType<typeof vi.fn>

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

function client(): ReturnType<typeof createFilesClient> {
  return createFilesClient(fetchMock as unknown as typeof fetch, '/api')
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
