'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentRequestError } from '../../src/client/editor/document-client.ts'
import type { DocumentClient } from '../../src/client/editor/document-client.ts'
import { createSession, defaultTemplate } from '../../src/client/editor/session.ts'

let client: {
  list: ReturnType<typeof vi.fn>
  read: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

beforeEach(() => {
  client = { list: vi.fn(), read: vi.fn(), save: vi.fn(), remove: vi.fn() }
})

function session(): ReturnType<typeof createSession> {
  return createSession(client as unknown as DocumentClient)
}

describe('defaultTemplate', () => {
  it('titles the document after its id', () => {
    expect(defaultTemplate('notes.md')).toContain('# notes')
  })

  it('strips a nested path from the title', () => {
    expect(defaultTemplate('journal/2026/september.md')).toContain('# september')
  })

  it('produces a valid markdown heading', () => {
    expect(defaultTemplate('notes.md').startsWith('# ')).toBe(true)
  })
})

describe('load', () => {
  it('returns the stored document', async () => {
    client.read.mockResolvedValue('# stored')

    await expect(session().load('notes.md')).resolves.toBe('# stored')
  })

  it('requests the document by id', async () => {
    client.read.mockResolvedValue('')

    await session().load('notes.md')

    expect(client.read).toHaveBeenCalledWith('notes.md')
  })

  it('falls back to a template when the document does not exist', async () => {
    client.read.mockRejectedValue(new DocumentRequestError(404, 'Document not found'))

    await expect(session().load('fresh.md')).resolves.toBe(defaultTemplate('fresh.md'))
  })

  it('rethrows a non-404 request error', async () => {
    client.read.mockRejectedValue(new DocumentRequestError(500, 'boom'))

    await expect(session().load('notes.md')).rejects.toThrow(DocumentRequestError)
  })

  it('rethrows an unexpected error', async () => {
    client.read.mockRejectedValue(new TypeError('network down'))

    await expect(session().load('notes.md')).rejects.toThrow(TypeError)
  })

  it('accepts a custom template', async () => {
    client.read.mockRejectedValue(new DocumentRequestError(404, 'Document not found'))
    const custom = createSession(client as unknown as DocumentClient, () => 'custom')

    await expect(custom.load('fresh.md')).resolves.toBe('custom')
  })
})

describe('save', () => {
  it('delegates to the client', async () => {
    client.save.mockResolvedValue(undefined)

    await session().save('notes.md', '# body')

    expect(client.save).toHaveBeenCalledWith('notes.md', '# body')
  })

  it('propagates a failure', async () => {
    client.save.mockRejectedValue(new DocumentRequestError(400, 'Invalid document id'))

    await expect(session().save('bad.txt', 'x')).rejects.toThrow(DocumentRequestError)
  })
})
