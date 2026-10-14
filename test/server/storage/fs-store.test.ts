'use sanity'

import fs from 'node:fs/promises'
import { compareNames } from '../../../src/server/storage/primitives/name-order.ts'
import { repairLinks } from '../../../src/server/markdown/relink.ts'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsDocumentStore, type StoreLayer } from '../../../src/server/storage/fs-store.ts'
import { DocumentNotFoundError, EntryExistsError } from '../../../src/server/storage/primitives/store-errors.ts'
import { InvalidPathError } from '../../../src/server/storage/primitives/safe-path.ts'

import { someone } from '../actors.ts'
import { storeContract } from './store-contract.ts'

const OVER_NAME_MAX = 'a'.repeat(300)

// Every segment is inside NAME_MAX, but the whole path exceeds PATH_MAX (4096),
// so the filesystem refuses it with ENAMETOOLONG rather than reporting absence.
const DEEP_FOLDER = Array.from({ length: 25 }, () => 'd'.repeat(200)).join('/')
const DEEP_DOCUMENT = `${DEEP_FOLDER}/notes.md`

// Shallow enough that the parent directory is creatable, so the failure lands
// on the leaf itself rather than on the walk down to it.
const CREATABLE_PARENT = Array.from({ length: 20 }, () => 'd'.repeat(200)).join('/')
const OVERLONG_LEAF = `${'l'.repeat(200)}.md`

let root = ''
let outside = ''
let store: StoreLayer = createFsDocumentStore('', repairLinks)

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-'))
  root = path.join(base, 'docs')
  outside = path.join(base, 'outside')
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(outside, { recursive: true })
  store = createFsDocumentStore(root, repairLinks)
})

afterEach(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true })
})
describe('the document store contract, over a real filesystem', () => {
  storeContract(() => store)
})

describe('read', () => {
  it('throws DocumentNotFoundError when the id names a directory', async () => {
    await fs.mkdir(path.join(root, 'adirectory.md'), { recursive: true })

    await expect(store.read('adirectory.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('surfaces a genuine filesystem fault rather than reporting it as missing', async () => {
    await expect(store.read(DEEP_DOCUMENT)).rejects.toThrow(expect.objectContaining({ code: 'ENAMETOOLONG' }))
  })

  it('refuses to follow a well-formed id whose symlink escapes the root', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(root, 'innocent.md'))

    await expect(store.read('innocent.md')).rejects.toThrow(InvalidPathError)
  })

  it('refuses to read through a symlinked directory that escapes the root', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
    await fs.symlink(outside, path.join(root, 'link'))

    await expect(store.read('link/secret.md')).rejects.toThrow(InvalidPathError)
  })

  it('allows a symlink that stays inside the root', async () => {
    await store.createDocument('real.md', 'inside', someone)
    await fs.symlink(path.join(root, 'real.md'), path.join(root, 'alias.md'))

    await expect(store.read('alias.md')).resolves.toBe('inside')
  })
})

describe('list', () => {
  it('returns an empty array when the root does not exist', async () => {
    const missing = createFsDocumentStore(path.join(root, 'does-not-exist'), repairLinks)

    await expect(missing.list(compareNames)).resolves.toStrictEqual([])
  })

  it('surfaces a genuine filesystem fault rather than returning an empty list', async () => {
    const unusable = createFsDocumentStore(path.join(root, OVER_NAME_MAX), repairLinks)

    await expect(unusable.list(compareNames)).rejects.toThrow(expect.objectContaining({ code: 'ENAMETOOLONG' }))
  })

  it('ignores files that are not documents', async () => {
    await store.createDocument('notes.md', 'x', someone)
    await fs.writeFile(path.join(root, 'image.png'), '')
    await fs.writeFile(path.join(root, 'README'), '')

    await expect(store.list(compareNames)).resolves.toStrictEqual(['notes.md'])
  })

  it('ignores dotfiles and dot-directories', async () => {
    await store.createDocument('notes.md', 'x', someone)
    await fs.writeFile(path.join(root, '.hidden.md'), '')
    await fs.mkdir(path.join(root, '.git'), { recursive: true })
    await fs.writeFile(path.join(root, '.git', 'config.md'), '')

    await expect(store.list(compareNames)).resolves.toStrictEqual(['notes.md'])
  })
})

describe('createDocument', () => {
  it('refuses a path occupied by a directory', async () => {
    await fs.mkdir(path.join(root, 'notes.md'), { recursive: true })

    await expect(store.createDocument('notes.md', 'x', someone)).rejects.toThrow(EntryExistsError)
  })

  it('refuses to create through a symlinked directory that escapes the root', async () => {
    await fs.symlink(outside, path.join(root, 'link'))

    await expect(store.createDocument('link/planted.md', 'x', someone)).rejects.toThrow(InvalidPathError)
  })

  it('surfaces a genuine filesystem fault rather than reporting the path as taken', async () => {
    await expect(store.createDocument(`${CREATABLE_PARENT}/${OVERLONG_LEAF}`, 'x', someone)).rejects.toThrow(
      expect.objectContaining({ code: 'ENAMETOOLONG' }),
    )
  })

  it('surfaces a fault from the walk down to the parent too', async () => {
    await expect(store.createDocument(DEEP_DOCUMENT, 'x', someone)).rejects.toThrow(
      expect.objectContaining({ code: 'ENAMETOOLONG' }),
    )
  })

  it('creates the document root if it does not yet exist', async () => {
    const fresh = createFsDocumentStore(path.join(root, 'nested', 'deeper'), repairLinks)
    await fresh.createDocument('notes.md', 'body', someone)

    await expect(fresh.read('notes.md')).resolves.toBe('body')
  })
})

describe('updateDocument', () => {
  it('refuses to follow a symlink that escapes the root', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(root, 'innocent.md'))

    await expect(store.updateDocument('innocent.md', 'x', '"e"', someone)).rejects.toThrow(InvalidPathError)
  })
})

describe('createFolder', () => {
  it('creates the directory', async () => {
    await store.createFolder('journal', '# journal', someone)

    await expect(fs.stat(path.join(root, 'journal')).then((s) => s.isDirectory())).resolves.toBe(true)
  })

  it('refuses to create through a symlinked directory that escapes the root', async () => {
    await fs.symlink(outside, path.join(root, 'link'))

    await expect(store.createFolder('link/planted', '# x', someone)).rejects.toThrow(InvalidPathError)
  })

  it('surfaces a genuine filesystem fault rather than reporting the path as taken', async () => {
    await expect(store.createFolder(`${CREATABLE_PARENT}/${'d'.repeat(200)}`, '# x', someone)).rejects.toThrow(
      expect.objectContaining({ code: 'ENAMETOOLONG' }),
    )
  })
})

describe('createUpload', () => {
  const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 7, 7])

  it('stores the bytes under the target directory', async () => {
    await store.createUpload('journal', 'photo.png', PNG, someone)

    await expect(
      fs.readFile(path.join(root, 'journal', 'photo.png')).then((b) => new Uint8Array(b)),
    ).resolves.toStrictEqual(PNG)
  })

  it('rejects a traversal in the target directory', async () => {
    await expect(store.createUpload('../outside', 'photo.png', PNG, someone)).rejects.toThrow(InvalidPathError)
  })

  it('refuses to upload through a symlinked directory that escapes the root', async () => {
    await fs.symlink(outside, path.join(root, 'link'))

    await expect(store.createUpload('link', 'photo.png', PNG, someone)).rejects.toThrow(InvalidPathError)
  })

  it('surfaces a genuine filesystem fault rather than reporting the path as taken', async () => {
    await expect(store.createUpload(CREATABLE_PARENT, `${'p'.repeat(200)}.png`, PNG, someone)).rejects.toThrow(
      expect.objectContaining({ code: 'ENAMETOOLONG' }),
    )
  })
})

describe('readBytes', () => {
  it('refuses to follow a symlink that escapes the root', async () => {
    await fs.writeFile(path.join(outside, 'secret.png'), 'classified')
    await fs.symlink(path.join(outside, 'secret.png'), path.join(root, 'innocent.png'))

    await expect(store.readBytes('innocent.png')).rejects.toThrow(InvalidPathError)
  })
})
