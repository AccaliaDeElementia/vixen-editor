'use sanity'

import { describe, expect, it } from 'vitest'

import { someone } from './actors.ts'
import { failingStore } from './failing-store.ts'
import { InvalidPathError } from '../../src/server/storage/primitives/safe-path.ts'
import { ContentMismatchError, EmptyContentError } from '../../src/server/storage/primitives/store-errors.ts'
import { validatingStore } from '../../src/server/validating-store.ts'

const REACHED_THE_LAYER = 'disk on fire'
const BYTES = new Uint8Array([1, 2, 3])
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

const store = validatingStore(failingStore())

describe('reading', () => {
  it('refuses a document id outside the document extensions', async () => {
    await expect(store.read('photo.png')).rejects.toThrow(InvalidPathError)
  })

  it('lets a document id through to the layer, so the refusal is about the name and not about reads', async () => {
    await expect(store.read('notes.md')).rejects.toThrow(REACHED_THE_LAYER)
  })

  it('refuses bytes at an extension outside the upload allowlist', async () => {
    await expect(store.readBytes('archive.zip')).rejects.toThrow(InvalidPathError)
  })

  it('refuses an archive of the trash, which is not addressable through the API', async () => {
    await expect(store.archive('.trash', { format: 'zip', maxBytes: 1, maxEntries: 1 })).rejects.toThrow(
      InvalidPathError,
    )
  })
})

describe('creating', () => {
  it('refuses a hidden id', async () => {
    await expect(store.createDocument('.hidden.md', 'x', someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses an extension that is not a document', async () => {
    await expect(store.createDocument('notes.zip', 'x', someone)).rejects.toThrow(InvalidPathError)
  })

  it('lets a document through to the layer', async () => {
    await expect(store.createDocument('notes.md', 'x', someone)).rejects.toThrow(REACHED_THE_LAYER)
  })

  it('refuses a hidden folder path, which is how the trash stays unreachable', async () => {
    await expect(store.createFolder('.trash', 'x', someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses a hidden id on a save as well as on a create', async () => {
    await expect(store.updateDocument('.hidden.md', 'x', '"e"', someone)).rejects.toThrow(InvalidPathError)
  })
})

describe('content the store would otherwise have written', () => {
  it.each([
    ['empty content', ''],
    ['whitespace-only content', '   \n  '],
  ])('refuses a new document with %s', async (_label, content) => {
    await expect(store.createDocument('notes.md', content, someone)).rejects.toThrow(EmptyContentError)
  })

  it.each([
    ['empty content', ''],
    ['whitespace-only content', '   \n  '],
  ])('refuses a save of %s', async (_label, content) => {
    await expect(store.updateDocument('notes.md', content, '"e"', someone)).rejects.toThrow(EmptyContentError)
  })

  it('refuses a folder seeded with nothing', async () => {
    await expect(store.createFolder('journal', '  ', someone)).rejects.toThrow(EmptyContentError)
  })

  it('refuses an empty upload', async () => {
    await expect(store.createUpload('', 'photo.png', new Uint8Array(), someone)).rejects.toThrow(EmptyContentError)
  })

  it('refuses bytes that do not match the extension', async () => {
    await expect(store.createUpload('', 'photo.png', BYTES, someone)).rejects.toThrow(ContentMismatchError)
  })

  it('never asks the layer to store what it refused, which is why nothing is left behind', async () => {
    await expect(store.createDocument('notes.md', '', someone)).rejects.not.toThrow(REACHED_THE_LAYER)
  })
})

describe('uploading', () => {
  it('refuses an extension outside the upload allowlist', async () => {
    await expect(store.createUpload('', 'archive.zip', BYTES, someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses a hidden filename', async () => {
    await expect(store.createUpload('', '.hidden.png', BYTES, someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses a filename carrying its own separator, before any path rule sees it', async () => {
    await expect(store.createUpload('', 'a/b.png', BYTES, someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses an upload into the reserved namespace', async () => {
    await expect(store.createUpload('.vixen', 'logo.png', BYTES, someone)).rejects.toThrow(InvalidPathError)
  })

  it('lets bytes that match their extension through to the layer', async () => {
    await expect(store.createUpload('', 'photo.png', PNG, someone)).rejects.toThrow(REACHED_THE_LAYER)
  })
})

describe('moving and deleting', () => {
  it('refuses the trash as a source', async () => {
    await expect(store.move({ from: '.trash', to: 'rescued' }, someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses the trash as a destination', async () => {
    await expect(store.move({ from: 'notes', to: '.trash' }, someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses to reach into the trash directory when deleting', async () => {
    await expect(store.trash('.trash', someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses a restore aimed into the reserved namespace', async () => {
    await expect(store.restore({ entryId: 'e1', paths: [], to: '.vixen' }, someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses a restore of a hidden path inside an entry', async () => {
    await expect(store.restore({ entryId: 'e1', paths: ['.secret.md'] }, someone)).rejects.toThrow(InvalidPathError)
  })

  it('lets a restore with nothing to object to through to the layer', async () => {
    await expect(store.restore({ entryId: 'e1', paths: ['notes.md'] }, someone)).rejects.toThrow(REACHED_THE_LAYER)
  })
})
