'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { given, givenAsync } from '../../../conditions.ts'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsDocumentStore, type StoreLayer } from '../../../../src/server/storage/fs-store.ts'
import { InvalidPathError } from '../../../../src/server/storage/primitives/safe-path.ts'
import { BlockedRestoreError, DocumentNotFoundError } from '../../../../src/server/storage/primitives/store-errors.ts'
import { TestOnly } from '../../../../src/server/storage/trash/trash.ts'
import { isRecord } from '../../../../src/shared/guards.ts'

import { someone } from '../../actors.ts'
import { anonymousActor, localActor } from '../../../../src/server/platform/actor.ts'

const { TRASH_DIRECTORY, TRASH_META_NAME, TRASH_PAYLOAD_NAME } = TestOnly

let root = ''
let store: StoreLayer = createFsDocumentStore('')

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
    await store.createDocument('notes.md', '# hello', someone)

    await store.trash('notes.md', someone)

    await expect(store.read('notes.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('keeps the content, so a delete is recoverable', async () => {
    await store.createDocument('notes.md', '# hello', someone)

    const id = await store.trash('notes.md', someone)

    await expect(fs.readFile(trashPath(id, TRASH_PAYLOAD_NAME), 'utf8')).resolves.toBe('# hello')
  })

  it('records where the entry came from', async () => {
    await store.createDocument('journal/2026/september.md', 'x', someone)

    const id = await store.trash('journal/2026/september.md', someone)
    const meta: unknown = JSON.parse(await fs.readFile(trashPath(id, TRASH_META_NAME), 'utf8'))

    expect(meta).toMatchObject({ originalPath: 'journal/2026/september.md', kind: 'document' })
  })

  it('records who deleted it, so a later listing can credit them', async () => {
    await store.createDocument('credited.md', 'x', someone)

    const id = await store.trash('credited.md', someone)
    const meta: unknown = JSON.parse(await fs.readFile(trashPath(id, TRASH_META_NAME), 'utf8'))

    expect(meta).toMatchObject({ deletedBy: someone.id })
  })

  it('credits the actor it was handed rather than a fixed one, so two callers are told apart', async () => {
    await store.createDocument('theirs.md', 'x', someone)
    const other = anonymousActor('198.51.100.4')

    const id = await store.trash('theirs.md', other)
    const meta: unknown = JSON.parse(await fs.readFile(trashPath(id, TRASH_META_NAME), 'utf8'))

    expect(meta).toMatchObject({ deletedBy: 'unauth:198.51.100.4' })
  })

  it('credits the user the server runs as for an entry trashed before anyone was recorded', async () => {
    await store.createDocument('ancient.md', 'x', someone)
    const id = await store.trash('ancient.md', someone)
    const asItWasWrittenBefore = { originalPath: 'ancient.md', deletedAt: '2026-01-01T00:00:00.000Z', kind: 'document' }
    await fs.writeFile(trashPath(id, TRASH_META_NAME), JSON.stringify(asItWasWrittenBefore))

    const [entry] = await store.listTrash()

    expect(entry?.deletedBy).toBe(localActor().id)
  })

  it('trashes a whole folder', async () => {
    await store.createFolder('journal', '# journal', someone)

    await store.trash('journal', someone)

    expect(await exists(path.join(root, 'journal'))).toBe(false)
  })

  it('keeps the folder contents under the trash entry', async () => {
    await store.createFolder('journal', '# journal', someone)
    await store.createDocument('journal/entry.md', '# entry', someone)

    const id = await store.trash('journal', someone)

    await expect(fs.readFile(trashPath(id, TRASH_PAYLOAD_NAME, 'entry.md'), 'utf8')).resolves.toBe('# entry')
  })

  it('records an image as an image', async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1])
    await store.createUpload('', 'photo.png', png, someone)

    const id = await store.trash('photo.png', someone)
    const meta: unknown = JSON.parse(await fs.readFile(trashPath(id, TRASH_META_NAME), 'utf8'))

    expect(meta).toMatchObject({ kind: 'image' })
  })

  it('records a folder whose name looks like a filename as a folder', async () => {
    await store.createFolder('v1.2', '# release', someone)

    const id = await store.trash('v1.2', someone)
    const meta: unknown = JSON.parse(await fs.readFile(trashPath(id, TRASH_META_NAME), 'utf8'))

    expect(meta).toMatchObject({ kind: 'folder' })
  })

  it('gives two deletes of the same path distinct entries', async () => {
    await store.createDocument('notes.md', 'first', someone)
    const first = await store.trash('notes.md', someone)
    await store.createDocument('notes.md', 'second', someone)
    const second = await store.trash('notes.md', someone)

    given(() => {
      expect(first).not.toBe(second)
    })

    await expect(store.listTrash()).resolves.toHaveLength(2)
  })

  it('keeps both copies when the same path is deleted twice', async () => {
    await store.createDocument('notes.md', 'first', someone)
    const first = await store.trash('notes.md', someone)
    await store.createDocument('notes.md', 'second', someone)
    const second = await store.trash('notes.md', someone)

    expect({
      first: await fs.readFile(trashPath(first, TRASH_PAYLOAD_NAME), 'utf8'),
      second: await fs.readFile(trashPath(second, TRASH_PAYLOAD_NAME), 'utf8'),
    }).toStrictEqual({ first: 'first', second: 'second' })
  })

  it('throws DocumentNotFoundError for a path that is not there', async () => {
    await expect(store.trash('missing.md', someone)).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects a traversal attempt', async () => {
    await expect(store.trash('../escape.md', someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses to trash the document root itself', async () => {
    await expect(store.trash('', someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses a file the app does not manage', async () => {
    await fs.writeFile(path.join(root, 'payload.zip'), 'x')

    await expect(store.trash('payload.zip', someone)).rejects.toThrow(InvalidPathError)
  })

  it('leaves the trash out of the live tree', async () => {
    await store.createDocument('notes.md', 'x', someone)
    await store.trash('notes.md', someone)

    await expect(store.tree()).resolves.toStrictEqual([])
  })
})

describe('listTrash', () => {
  it('is empty before anything is deleted', async () => {
    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('reports the original path, kind and time of deletion', async () => {
    await store.createDocument('notes.md', 'x', someone)
    const id = await store.trash('notes.md', someone)

    const listed = await store.listTrash()

    expect({ listed, deletedAt: Date.parse(listed[0]?.deletedAt ?? '') }).toMatchObject({
      listed: [{ id, originalPath: 'notes.md', kind: 'document' }],
      deletedAt: expect.any(Number) as unknown,
    })
  })

  it('lists the most recently deleted entry first', async () => {
    await store.createDocument('older.md', 'x', someone)
    await store.createDocument('newer.md', 'x', someone)
    const older = await store.trash('older.md', someone)
    const newer = await store.trash('newer.md', someone)
    await redate(older, '2026-01-01T00:00:00.000Z')
    await redate(newer, '2026-06-01T00:00:00.000Z')

    const listed = await store.listTrash()

    expect(listed.map((entry) => entry.id)).toStrictEqual([newer, older])
  })

  it('orders entries sharing a timestamp by id, so a burst of deletes does not reshuffle', async () => {
    await store.createDocument('a.md', 'x', someone)
    await store.createDocument('b.md', 'x', someone)
    const first = await store.trash('a.md', someone)
    const second = await store.trash('b.md', someone)
    await redate(first, '2026-01-01T00:00:00.000Z')
    await redate(second, '2026-01-01T00:00:00.000Z')

    const listed = await store.listTrash()

    expect(listed.map((entry) => entry.id)).toStrictEqual([first, second].sort((a, b) => a.localeCompare(b)))
  })

  it('skips an entry whose metadata is unreadable, so one damaged entry loses only itself', async () => {
    await store.createDocument('good.md', 'x', someone)
    await store.createDocument('bad.md', 'x', someone)
    await store.trash('good.md', someone)
    const damaged = await store.trash('bad.md', someone)
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
    await store.createDocument('bad.md', 'x', someone)
    const damaged = await store.trash('bad.md', someone)
    await fs.writeFile(trashPath(damaged, TRASH_META_NAME), meta)

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('skips an entry whose metadata is missing entirely', async () => {
    await store.createDocument('bad.md', 'x', someone)
    const damaged = await store.trash('bad.md', someone)
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
    await store.createDocument('journal/notes.md', '# hello', someone)
    const id = await store.trash('journal/notes.md', someone)

    await store.restore({ entryId: id, paths: [''] }, someone)

    await expect(store.read('journal/notes.md')).resolves.toBe('# hello')
  })

  it('reports the path it restored to', async () => {
    await store.createDocument('notes.md', 'x', someone)
    const id = await store.trash('notes.md', someone)

    await expect(store.restore({ entryId: id, paths: [''] }, someone)).resolves.toMatchObject({
      restored: ['notes.md'],
    })
  })

  it('restores a folder with its contents', async () => {
    await store.createFolder('journal', '# journal', someone)
    await store.createDocument('journal/entry.md', '# entry', someone)
    const id = await store.trash('journal', someone)

    await store.restore({ entryId: id, paths: [''] }, someone)

    await expect(store.read('journal/entry.md')).resolves.toBe('# entry')
  })

  it('recreates a parent folder that was removed in the meantime', async () => {
    await store.createFolder('journal', '# journal', someone)
    await store.createDocument('journal/notes.md', '# hello', someone)
    const id = await store.trash('journal/notes.md', someone)
    await store.trash('journal', someone)

    await store.restore({ entryId: id, paths: [''] }, someone)

    await expect(store.read('journal/notes.md')).resolves.toBe('# hello')
  })

  it('drops the trash entry once restored', async () => {
    await store.createDocument('notes.md', 'x', someone)
    const id = await store.trash('notes.md', someone)

    await store.restore({ entryId: id, paths: [''] }, someone)

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('refuses when something already occupies the original path', async () => {
    await store.createDocument('notes.md', 'first', someone)
    const id = await store.trash('notes.md', someone)
    await store.createDocument('notes.md', 'second', someone)

    await expect(store.restore({ entryId: id, paths: [''] }, someone)).rejects.toThrow(BlockedRestoreError)
  })

  it('leaves the occupant untouched when it refuses', async () => {
    await store.createDocument('notes.md', 'first', someone)
    const id = await store.trash('notes.md', someone)
    await store.createDocument('notes.md', 'second', someone)

    await givenAsync(expect(store.restore({ entryId: id, paths: [''] }, someone)).rejects.toThrow(BlockedRestoreError))

    await expect(store.read('notes.md')).resolves.toBe('second')
  })

  it('keeps the entry in the trash when it refuses, so nothing is lost', async () => {
    await store.createDocument('notes.md', 'first', someone)
    const id = await store.trash('notes.md', someone)
    await store.createDocument('notes.md', 'second', someone)

    await givenAsync(expect(store.restore({ entryId: id, paths: [''] }, someone)).rejects.toThrow(BlockedRestoreError))

    await expect(store.listTrash()).resolves.toHaveLength(1)
  })

  it('throws DocumentNotFoundError for an unknown entry', async () => {
    await expect(
      store.restore({ entryId: '00000000-0000-4000-8000-000000000000', paths: [''] }, someone),
    ).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects an entry id that is not a uuid, which is what keeps it out of the path', async () => {
    await expect(store.restore({ entryId: '../../escape', paths: [''] }, someone)).rejects.toThrow(InvalidPathError)
  })

  it('throws DocumentNotFoundError when the payload is gone but the metadata is not', async () => {
    await store.createDocument('notes.md', 'x', someone)
    const id = await store.trash('notes.md', someone)
    await fs.rm(trashPath(id, TRASH_PAYLOAD_NAME))

    await expect(store.restore({ entryId: id, paths: [''] }, someone)).rejects.toThrow(DocumentNotFoundError)
  })
})

describe('purge', () => {
  it('drops the entry from the trash listing', async () => {
    await store.createDocument('notes.md', 'x', someone)
    const id = await store.trash('notes.md', someone)

    await store.purge(id, someone)

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('removes the stored bytes for good', async () => {
    await store.createDocument('notes.md', 'x', someone)
    const id = await store.trash('notes.md', someone)

    await store.purge(id, someone)

    expect(await exists(trashPath(id))).toBe(false)
  })

  it('purges a folder entry and everything under it', async () => {
    await store.createFolder('journal', '# journal', someone)
    await store.createDocument('journal/entry.md', '# entry', someone)
    const id = await store.trash('journal', someone)

    await store.purge(id, someone)

    expect(await exists(trashPath(id))).toBe(false)
  })

  it('leaves other entries alone', async () => {
    await store.createDocument('a.md', 'x', someone)
    await store.createDocument('b.md', 'x', someone)
    const first = await store.trash('a.md', someone)
    await store.trash('b.md', someone)

    await store.purge(first, someone)

    await expect(store.listTrash()).resolves.toMatchObject([{ originalPath: 'b.md' }])
  })

  it('throws DocumentNotFoundError for an unknown entry', async () => {
    await expect(store.purge('00000000-0000-4000-8000-000000000000', someone)).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects an entry id that is not a uuid', async () => {
    await expect(store.purge('../../escape', someone)).rejects.toThrow(InvalidPathError)
  })
})

describe('emptying the trash', () => {
  it('counts nothing when there is nothing in it', async () => {
    expect(await store.emptyTrash(someone)).toBe(0)
  })

  it('removes every entry it held', async () => {
    await store.createDocument('a.md', '# a', someone)
    await store.createDocument('b.md', '# b', someone)
    await store.trash('a.md', someone)
    await store.trash('b.md', someone)

    await store.emptyTrash(someone)

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })

  it('reports how many entries went', async () => {
    await store.createDocument('a.md', '# a', someone)
    await store.createDocument('b.md', '# b', someone)
    await store.trash('a.md', someone)
    await store.trash('b.md', someone)

    expect(await store.emptyTrash(someone)).toBe(2)
  })

  it('takes the content with it, not merely the listing', async () => {
    await store.createDocument('a.md', '# a', someone)
    const entryId = await store.trash('a.md', someone)

    await store.emptyTrash(someone)

    expect(await exists(trashPath(entryId))).toBe(false)
  })

  it('clears an entry the listing hides, so damage cannot outlive the trash', async () => {
    await store.createDocument('a.md', '# a', someone)
    const entryId = await store.trash('a.md', someone)
    await fs.rm(trashPath(entryId, TRASH_META_NAME))
    await givenAsync(expect(store.listTrash()).resolves.toStrictEqual([]))

    await store.emptyTrash(someone)

    expect(await exists(trashPath(entryId))).toBe(false)
  })

  it('counts a damaged entry too, since it was something the reader could see no way to remove', async () => {
    await store.createDocument('a.md', '# a', someone)
    const entryId = await store.trash('a.md', someone)
    await fs.rm(trashPath(entryId, TRASH_META_NAME))

    expect(await store.emptyTrash(someone)).toBe(1)
  })

  it('leaves the live tree alone', async () => {
    await store.createDocument('kept.md', '# kept', someone)
    await store.createDocument('gone.md', '# gone', someone)
    await store.trash('gone.md', someone)

    await store.emptyTrash(someone)

    await expect(store.read('kept.md')).resolves.toBe('# kept')
  })

  it('leaves the trash itself in place, ready for the next delete', async () => {
    await store.createDocument('a.md', '# a', someone)
    await store.trash('a.md', someone)

    await store.emptyTrash(someone)

    expect(await exists(trashPath())).toBe(true)
  })

  it('removes a link left in the trash without following it out of the store', async () => {
    const outside = path.join(root, 'outside.md')
    await fs.writeFile(outside, '# outside', 'utf8')
    await fs.mkdir(trashPath(), { recursive: true })
    await fs.symlink(outside, trashPath('escaping'))

    await store.emptyTrash(someone)

    expect(await exists(outside)).toBe(true)
  })

  it('counts a link it removed, because it was in the trash', async () => {
    const outside = path.join(root, 'outside.md')
    await fs.writeFile(outside, '# outside', 'utf8')
    await fs.mkdir(trashPath(), { recursive: true })
    await fs.symlink(outside, trashPath('escaping'))

    expect(await store.emptyTrash(someone)).toBe(1)
  })
})
