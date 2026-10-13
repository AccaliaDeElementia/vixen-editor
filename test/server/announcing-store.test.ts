'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { givenAsync } from '../conditions.ts'

import { announcingStore } from '../../src/server/announcing-store.ts'
import { createChanges, type StoreChange } from '../../src/server/platform/changes.ts'
import { createFsDocumentStore, type DocumentStore } from '../../src/server/storage/fs-store.ts'
import { STORE_ROOT } from '../../src/shared/store-path.ts'

import { someone } from './actors.ts'

const PNG_BYTES = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

let root = ''
let plain: DocumentStore = createFsDocumentStore('')
let announcing: DocumentStore = plain
let heard: StoreChange[] = []

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-announce-'))
  plain = createFsDocumentStore(root)
  const changes = createChanges()
  heard = []
  changes.listen((change) => {
    heard.push(change)
  })
  announcing = announcingStore(plain, changes)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('what the store announces', () => {
  it('says a new document was written', async () => {
    await announcing.createDocument('a.md', '# a', someone)

    expect(heard).toStrictEqual([{ path: 'a.md', kind: 'written' }])
  })

  it('says a new folder was written', async () => {
    await announcing.createFolder('journal', '# journal', someone)

    expect(heard).toStrictEqual([{ path: 'journal', kind: 'written' }])
  })

  it('says an uploaded file was written', async () => {
    await announcing.createUpload(STORE_ROOT, 'photo.png', PNG_BYTES, someone)

    expect(heard).toStrictEqual([{ path: 'photo.png', kind: 'written' }])
  })

  it('names where the upload actually landed, not where it was aimed', async () => {
    await announcing.createFolder('journal', '# journal', someone)
    heard = []

    await announcing.createUpload('journal', 'photo.png', PNG_BYTES, someone)

    expect(heard).toStrictEqual([{ path: 'journal/photo.png', kind: 'written' }])
  })

  it('says a saved document was written', async () => {
    const etag = await plain.createDocument('a.md', '# a', someone)
    heard = []

    await announcing.updateDocument('a.md', '# edited', etag, someone)

    expect(heard).toStrictEqual([{ path: 'a.md', kind: 'written' }])
  })

  it('says a move is one event, so the two ends cannot be mistaken for unrelated edits', async () => {
    await plain.createDocument('a.md', '# a', someone)
    heard = []

    await announcing.move({ from: 'a.md', to: 'b.md' }, someone)

    expect(heard).toStrictEqual([{ kind: 'moved', from: 'a.md', to: 'b.md' }])
  })

  it('writes a document a move rewrote, so listening for writes alone is not wrong', async () => {
    await plain.createDocument('linker.md', '[to a](a.md)\n', someone)
    await plain.createDocument('a.md', '# a', someone)
    heard = []

    await announcing.move({ from: 'a.md', to: 'b.md' }, someone)

    expect(heard).toStrictEqual([
      { kind: 'moved', from: 'a.md', to: 'b.md' },
      { path: 'linker.md', kind: 'written' },
    ])
  })

  it('says a trashed entry was removed', async () => {
    await plain.createDocument('a.md', '# a', someone)
    heard = []

    await announcing.trash('a.md', someone)

    expect(heard).toStrictEqual([{ path: 'a.md', kind: 'removed' }])
  })

  it('says where a restored entry came back to', async () => {
    await plain.createDocument('a.md', '# a', someone)
    const entryId = await plain.trash('a.md', someone)
    heard = []

    await announcing.restore({ entryId, paths: [STORE_ROOT] }, someone)

    expect(heard).toStrictEqual([{ path: 'a.md', kind: 'written' }])
  })

  it('says the store changed when an entry is purged, because the trash listing did', async () => {
    await plain.createDocument('a.md', '# a', someone)
    const entryId = await plain.trash('a.md', someone)
    heard = []

    await announcing.purge(entryId, someone)

    expect(heard).toStrictEqual([{ path: STORE_ROOT, kind: 'removed' }])
  })

  it('says the store changed when the trash is emptied, since the listing did', async () => {
    await plain.createDocument('a.md', '# a', someone)
    await plain.trash('a.md', someone)
    heard = []

    await announcing.emptyTrash(someone)

    expect(heard).toStrictEqual([{ path: STORE_ROOT, kind: 'removed' }])
  })

  it('says so even when the trash was already empty, because a listener cannot tell in advance', async () => {
    await announcing.emptyTrash(someone)

    expect(heard).toStrictEqual([{ path: STORE_ROOT, kind: 'removed' }])
  })

  it('says nothing when the write was refused', async () => {
    await plain.createDocument('a.md', '# a', someone)
    heard = []

    await givenAsync(expect(announcing.createDocument('a.md', '# again', someone)).rejects.toThrow())

    expect(heard).toStrictEqual([])
  })

  it('reads without announcing, since nothing changed', async () => {
    await plain.createDocument('a.md', '# a', someone)
    heard = []

    await announcing.read('a.md')

    expect(heard).toStrictEqual([])
  })
})
