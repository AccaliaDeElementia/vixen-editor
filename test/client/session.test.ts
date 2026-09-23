'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DocumentRequestError } from '../../src/client/editor/document-client.ts'
import type { DocumentClient } from '../../src/client/editor/document-client.ts'
import { createSession, defaultTemplate } from '../../src/client/editor/session.ts'

let client: {
  list: ReturnType<typeof vi.fn>
  read: ReturnType<typeof vi.fn>
  create: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
}

function loaded(content: string, etag = '"e1"'): { content: string; etag: string } {
  return { content, etag }
}

beforeEach(() => {
  client = { list: vi.fn(), read: vi.fn(), create: vi.fn(), save: vi.fn(), remove: vi.fn() }
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

  it('strips a plain text extension too, matching what the server would seed', () => {
    expect(defaultTemplate('notes.txt')).toContain('# notes\n')
  })

  it('produces a valid markdown heading', () => {
    expect(defaultTemplate('notes.md').startsWith('# ')).toBe(true)
  })
})

describe('load', () => {
  it('returns the stored document', async () => {
    client.read.mockResolvedValue(loaded('# stored'))

    await expect(session().load('notes.md')).resolves.toBe('# stored')
  })

  it('requests the document by id', async () => {
    client.read.mockResolvedValue(loaded(''))

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
  it('quotes back the etag the load returned', async () => {
    client.read.mockResolvedValue(loaded('# stored', '"abc"'))
    client.save.mockResolvedValue('"next"')
    const active = session()
    await active.load('notes.md')

    await active.save('notes.md', '# body')

    expect(client.save).toHaveBeenCalledWith('notes.md', '# body', '"abc"')
  })

  it('carries the etag returned by the previous save into the next one', async () => {
    client.read.mockResolvedValue(loaded('# stored', '"abc"'))
    client.save.mockResolvedValue('"next"')
    const active = session()
    await active.load('notes.md')

    await active.save('notes.md', 'first')
    await active.save('notes.md', 'second')

    expect(client.save).toHaveBeenLastCalledWith('notes.md', 'second', '"next"')
  })

  it('creates a document that was never on the server rather than failing the precondition', async () => {
    client.read.mockRejectedValue(new DocumentRequestError(404, 'Document not found'))
    client.create.mockResolvedValue('"fresh"')
    const active = session()
    await active.load('fresh.md')

    await active.save('fresh.md', '# body')

    expect(client.create).toHaveBeenCalledWith('fresh.md', '# body')
    expect(client.save).not.toHaveBeenCalled()
  })

  it('saves normally once a created document has an etag', async () => {
    client.read.mockRejectedValue(new DocumentRequestError(404, 'Document not found'))
    client.create.mockResolvedValue('"fresh"')
    client.save.mockResolvedValue('"later"')
    const active = session()
    await active.load('fresh.md')
    await active.save('fresh.md', 'first')

    await active.save('fresh.md', 'second')

    expect(client.save).toHaveBeenCalledWith('fresh.md', 'second', '"fresh"')
  })

  it('creates when the document was never loaded at all', async () => {
    client.create.mockResolvedValue('"fresh"')

    await session().save('never-loaded.md', 'x')

    expect(client.create).toHaveBeenCalledWith('never-loaded.md', 'x')
  })

  it('keeps etags per document, so saving one does not corrupt another', async () => {
    client.read.mockResolvedValueOnce(loaded('a', '"etag-a"')).mockResolvedValueOnce(loaded('b', '"etag-b"'))
    client.save.mockResolvedValue('"saved"')
    const active = session()
    await active.load('a.md')
    await active.load('b.md')

    await active.save('a.md', 'x')

    expect(client.save).toHaveBeenCalledWith('a.md', 'x', '"etag-a"')
  })

  it('propagates a failure', async () => {
    client.create.mockRejectedValue(new DocumentRequestError(400, 'Invalid path'))

    await expect(session().save('bad.zip', 'x')).rejects.toThrow(DocumentRequestError)
  })

  it('propagates a conflict so the caller can tell the user their copy is stale', async () => {
    client.read.mockResolvedValue(loaded('# stored', '"abc"'))
    client.save.mockRejectedValue(new DocumentRequestError(412, 'Document changed'))
    const active = session()
    await active.load('notes.md')

    await expect(active.save('notes.md', 'x')).rejects.toMatchObject({ status: 412 })
  })
})
