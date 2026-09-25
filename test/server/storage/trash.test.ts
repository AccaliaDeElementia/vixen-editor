'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import { InvalidPathError } from '../../../src/server/storage/safe-path.ts'
import { DocumentNotFoundError, EntryExistsError } from '../../../src/server/storage/store-errors.ts'
import { TestOnly } from '../../../src/server/storage/trash.ts'
import { isRecord } from '../../../src/shared/guards.ts'

const { TRASH_DIRECTORY, TRASH_META_NAME, TRASH_PAYLOAD_NAME } = TestOnly

let root: string
let store: DocumentStore

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-trash-'))
  store = createFsDocumentStore(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function trashPath(...parts: string[]): string {
  return path.join(root, TRASH_DIRECTORY, ...parts)
}

// Two deletes in the same millisecond carry the same timestamp, which would
// leave both the ordering and the tie-break asserted below untested.
async function redate(entryId: string, deletedAt: string): Promise<void> {
  const file = trashPath(entryId, TRASH_META_NAME)
  const meta: unknown = JSON.parse(await fs.readFile(file, 'utf8'))
  if (!isRecord(meta)) throw new Error(`${file} does not hold an object`)

  await fs.writeFile(file, JSON.stringify({ ...meta, deletedAt }), 'utf8')
}

async function exists(target: string): Promise<boolean> {
  return await fs
    .stat(target)
    .then(() => true)
    .catch(() => false)
}

describe('trash', () => {
  it('removes the document from the live tree', async () => {
    await store.createDocument('notes.md', '# hello')

    await store.trash('notes.md')

    await expect(store.read('notes.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('keeps the content, so a delete is recoverable', async () => {
    await store.createDocument('notes.md', '# hello')

    const id = await store.trash('notes.md')

    await expect(fs.readFile(trashPath(id, TRASH_PAYLOAD_NAME), 'utf8')).resolves.toBe('# hello')
  })

  it('records where the entry came from', async () => {
    await store.createDocument('journal/2026/september.md', 'x')

    const id = await store.trash('journal/2026/september.md')
    const meta: unknown = JSON.parse(await fs.readFile(trashPath(id, TRASH_META_NAME), 'utf8'))

    expect(meta).toMatchObject({ originalPath: 'journal/2026/september.md', kind: 'document' })
  })

  it('trashes a whole folder', async () => {
    await store.createFolder('journal', '# journal')

    await store.trash('journal')

    expect(await exists(path.join(root, 'journal'))).toBe(false)
  })

  it('keeps the folder contents under the trash entry', async () => {
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/entry.md', '# entry')

    const id = await store.trash('journal')

    await expect(fs.readFile(trashPath(id, TRASH_PAYLOAD_NAME, 'entry.md'), 'utf8')).resolves.toBe('# entry')
  })

  it('records an image as an image', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])
    await store.createUpload('', 'photo.png', png)

    const id = await store.trash('photo.png')
    const meta: unknown = JSON.parse(await fs.readFile(trashPath(id, TRASH_META_NAME), 'utf8'))

    expect(meta).toMatchObject({ kind: 'image' })
  })

  it('records a folder whose name looks like a filename as a folder', async () => {
    await store.createFolder('v1.2', '# release')

    const id = await store.trash('v1.2')
    const meta: unknown = JSON.parse(await fs.readFile(trashPath(id, TRASH_META_NAME), 'utf8'))

    expect(meta).toMatchObject({ kind: 'folder' })
  })

  it('gives two deletes of the same path distinct entries', async () => {
    await store.createDocument('notes.md', 'first')
    const first = await store.trash('notes.md')
    await store.createDocument('notes.md', 'second')
    const second = await store.trash('notes.md')

    expect(first).not.toBe(second)
    await expect(store.listTrash()).resolves.toHaveLength(2)
  })

  it('keeps both copies when the same path is deleted twice', async () => {
    await store.createDocument('notes.md', 'first')
    const first = await store.trash('notes.md')
    await store.createDocument('notes.md', 'second')
    const second = await store.trash('notes.md')

    await expect(fs.readFile(trashPath(first, TRASH_PAYLOAD_NAME), 'utf8')).resolves.toBe('first')
    await expect(fs.readFile(trashPath(second, TRASH_PAYLOAD_NAME), 'utf8')).resolves.toBe('second')
  })

  it('throws DocumentNotFoundError for a path that is not there', async () => {
    await expect(store.trash('missing.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects a traversal attempt', async () => {
    await expect(store.trash('../escape.md')).rejects.toThrow(InvalidPathError)
  })

  it('refuses to trash the document root itself', async () => {
    await expect(store.trash('')).rejects.toThrow(InvalidPathError)
  })

  it('refuses to reach into the trash directory', async () => {
    await expect(store.trash('.trash')).rejects.toThrow(InvalidPathError)
  })

  it('refuses a file the app does not manage', async () => {
    await fs.writeFile(path.join(root, 'payload.zip'), 'x')

    await expect(store.trash('payload.zip')).rejects.toThrow(InvalidPathError)
  })

  it('leaves the trash out of the live tree', async () => {
    await store.createDocument('notes.md', 'x')
    await store.trash('notes.md')

    await expect(store.tree()).resolves.toStrictEqual([])
  })
})

describe('listTrash', () => {
  it('is empty before anything is deleted', async () => {
    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('reports the original path, kind and time of deletion', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')

    const listed = await store.listTrash()

    expect(listed).toMatchObject([{ id, originalPath: 'notes.md', kind: 'document' }])
    expect(Date.parse(listed[0]?.deletedAt ?? '')).not.toBeNaN()
  })

  it('lists the most recently deleted entry first', async () => {
    await store.createDocument('older.md', 'x')
    await store.createDocument('newer.md', 'x')
    const older = await store.trash('older.md')
    const newer = await store.trash('newer.md')
    await redate(older, '2026-01-01T00:00:00.000Z')
    await redate(newer, '2026-06-01T00:00:00.000Z')

    const listed = await store.listTrash()

    expect(listed.map((entry) => entry.id)).toStrictEqual([newer, older])
  })

  it('orders entries sharing a timestamp by id, so a burst of deletes does not reshuffle', async () => {
    await store.createDocument('a.md', 'x')
    await store.createDocument('b.md', 'x')
    const first = await store.trash('a.md')
    const second = await store.trash('b.md')
    await redate(first, '2026-01-01T00:00:00.000Z')
    await redate(second, '2026-01-01T00:00:00.000Z')

    const listed = await store.listTrash()

    expect(listed.map((entry) => entry.id)).toStrictEqual([first, second].sort((a, b) => a.localeCompare(b)))
  })

  it('skips an entry whose metadata is unreadable, so one damaged entry loses only itself', async () => {
    await store.createDocument('good.md', 'x')
    await store.createDocument('bad.md', 'x')
    await store.trash('good.md')
    const damaged = await store.trash('bad.md')
    await fs.writeFile(trashPath(damaged, TRASH_META_NAME), 'not json at all')

    await expect(store.listTrash()).resolves.toMatchObject([{ originalPath: 'good.md' }])
  })

  it.each([
    ['a json primitive', '42'],
    ['json null', 'null'],
    ['a json string', '"surprise"'],
    ['a non-string original path', JSON.stringify({ originalPath: 42, deletedAt: 'now', kind: 'document' })],
    ['a missing deletion time', JSON.stringify({ originalPath: 'bad.md', kind: 'document' })],
    ['a non-string deletion time', JSON.stringify({ originalPath: 'bad.md', deletedAt: 0, kind: 'document' })],
    ['an unrecognised kind', JSON.stringify({ originalPath: 'bad.md', deletedAt: 'now', kind: 'sandwich' })],
    ['a missing kind', JSON.stringify({ originalPath: 'bad.md', deletedAt: 'now' })],
  ])('skips an entry whose metadata is %s', async (_label, meta) => {
    await store.createDocument('bad.md', 'x')
    const damaged = await store.trash('bad.md')
    await fs.writeFile(trashPath(damaged, TRASH_META_NAME), meta)

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('skips an entry whose metadata is missing entirely', async () => {
    await store.createDocument('bad.md', 'x')
    const damaged = await store.trash('bad.md')
    await fs.rm(trashPath(damaged, TRASH_META_NAME))

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('ignores a stray directory that is not a trash entry', async () => {
    await fs.mkdir(trashPath('not-a-uuid'), { recursive: true })

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })
})

describe('restore', () => {
  it('puts the document back where it came from', async () => {
    await store.createDocument('journal/notes.md', '# hello')
    const id = await store.trash('journal/notes.md')

    await store.restore(id)

    await expect(store.read('journal/notes.md')).resolves.toBe('# hello')
  })

  it('reports the path it restored to', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')

    await expect(store.restore(id)).resolves.toBe('notes.md')
  })

  it('restores a folder with its contents', async () => {
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/entry.md', '# entry')
    const id = await store.trash('journal')

    await store.restore(id)

    await expect(store.read('journal/entry.md')).resolves.toBe('# entry')
  })

  it('recreates a parent folder that was removed in the meantime', async () => {
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/notes.md', '# hello')
    const id = await store.trash('journal/notes.md')
    await store.trash('journal')

    await store.restore(id)

    await expect(store.read('journal/notes.md')).resolves.toBe('# hello')
  })

  it('drops the trash entry once restored', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')

    await store.restore(id)

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('refuses when something already occupies the original path', async () => {
    await store.createDocument('notes.md', 'first')
    const id = await store.trash('notes.md')
    await store.createDocument('notes.md', 'second')

    await expect(store.restore(id)).rejects.toThrow(EntryExistsError)
  })

  it('leaves the occupant untouched when it refuses', async () => {
    await store.createDocument('notes.md', 'first')
    const id = await store.trash('notes.md')
    await store.createDocument('notes.md', 'second')

    await expect(store.restore(id)).rejects.toThrow(EntryExistsError)
    await expect(store.read('notes.md')).resolves.toBe('second')
  })

  it('keeps the entry in the trash when it refuses, so nothing is lost', async () => {
    await store.createDocument('notes.md', 'first')
    const id = await store.trash('notes.md')
    await store.createDocument('notes.md', 'second')

    await expect(store.restore(id)).rejects.toThrow(EntryExistsError)
    await expect(store.listTrash()).resolves.toHaveLength(1)
  })

  it('throws DocumentNotFoundError for an unknown entry', async () => {
    await expect(store.restore('00000000-0000-4000-8000-000000000000')).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects an entry id that is not a uuid, which is what keeps it out of the path', async () => {
    await expect(store.restore('../../escape')).rejects.toThrow(InvalidPathError)
  })

  it('throws DocumentNotFoundError when the payload is gone but the metadata is not', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')
    await fs.rm(trashPath(id, TRASH_PAYLOAD_NAME))

    await expect(store.restore(id)).rejects.toThrow(DocumentNotFoundError)
  })
})

describe('purge', () => {
  it('drops the entry from the trash listing', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')

    await store.purge(id)

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('removes the stored bytes for good', async () => {
    await store.createDocument('notes.md', 'x')
    const id = await store.trash('notes.md')

    await store.purge(id)

    expect(await exists(trashPath(id))).toBe(false)
  })

  it('purges a folder entry and everything under it', async () => {
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/entry.md', '# entry')
    const id = await store.trash('journal')

    await store.purge(id)

    expect(await exists(trashPath(id))).toBe(false)
  })

  it('leaves other entries alone', async () => {
    await store.createDocument('a.md', 'x')
    await store.createDocument('b.md', 'x')
    const first = await store.trash('a.md')
    await store.trash('b.md')

    await store.purge(first)

    await expect(store.listTrash()).resolves.toMatchObject([{ originalPath: 'b.md' }])
  })

  it('throws DocumentNotFoundError for an unknown entry', async () => {
    await expect(store.purge('00000000-0000-4000-8000-000000000000')).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects an entry id that is not a uuid', async () => {
    await expect(store.purge('../../escape')).rejects.toThrow(InvalidPathError)
  })
})
