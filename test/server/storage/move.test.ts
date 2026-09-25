'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import type { RelinkOutcome } from '../../../src/server/storage/relink-store.ts'
import { InvalidPathError } from '../../../src/server/storage/safe-path.ts'
import { DocumentNotFoundError, EntryExistsError, InvalidMoveError } from '../../../src/server/storage/store-errors.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

let root = ''
let store: DocumentStore = createFsDocumentStore('')

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-move-'))
  store = createFsDocumentStore(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function move(from: string, to: string): Promise<RelinkOutcome> {
  return store.move({ from, to })
}

async function rewrittenBy(from: string, to: string): Promise<string[]> {
  return (await move(from, to)).rewritten
}

async function exists(...parts: string[]): Promise<boolean> {
  return await fs
    .stat(path.join(root, ...parts))
    .then(() => true)
    .catch(() => false)
}

describe('repairing links', () => {
  it('re-bases the links inside a document that itself moved', async () => {
    await store.createDocument('img/p.png', 'x').catch(() => undefined)
    await fs.mkdir(path.join(root, 'img'), { recursive: true })
    await fs.writeFile(path.join(root, 'img', 'p.png'), 'x')
    await store.createDocument('journal/a.md', '![p](../img/p.png)')

    const rewritten = await rewrittenBy('journal', 'deep/journal')

    expect(rewritten).toStrictEqual(['deep/journal/a.md'])
    await expect(store.read('deep/journal/a.md')).resolves.toBe('![p](../../img/p.png)')
  })

  it('repairs a link held by a document that did not move', async () => {
    await store.createDocument('journal/a.md', '# a')
    await store.createDocument('notes.md', 'see [it](journal/a.md)')

    const rewritten = await rewrittenBy('journal/a.md', 'archive/a.md')

    expect(rewritten).toStrictEqual(['notes.md'])
    await expect(store.read('notes.md')).resolves.toBe('see [it](archive/a.md)')
  })

  it('reports nothing when a move breaks no links', async () => {
    await store.createDocument('notes.md', '# hello')

    await expect(rewrittenBy('notes.md', 'renamed.md')).resolves.toStrictEqual([])
  })
})

describe('renaming', () => {
  it('moves a document to a new name in the same folder', async () => {
    await store.createDocument('notes.md', '# hello')

    await move('notes.md', 'renamed.md')

    await expect(store.read('renamed.md')).resolves.toBe('# hello')
    expect(await exists('notes.md')).toBe(false)
  })

  it('renames between document extensions, which name the same kind of thing', async () => {
    await store.createDocument('notes.md', '# hello')

    await move('notes.md', 'notes.txt')

    await expect(store.read('notes.txt')).resolves.toBe('# hello')
  })

  it('renames a folder', async () => {
    await store.createFolder('journal', '# journal')

    await move('journal', 'diary')

    await expect(store.read('diary/index.md')).resolves.toContain('# journal')
  })

  it('renames a folder whose name looks like a filename', async () => {
    await store.createFolder('v1.2', '# release')

    await move('v1.2', 'v1.3')

    expect(await exists('v1.3', 'index.md')).toBe(true)
  })

  it('refuses to turn a document into an image, which the raw route would then mistype', async () => {
    await store.createDocument('notes.md', '# hello')

    await expect(move('notes.md', 'notes.svg')).rejects.toThrow(InvalidPathError)
  })

  it('refuses to turn an image into a document', async () => {
    await store.createUpload('', 'photo.png', PNG)

    await expect(move('photo.png', 'photo.md')).rejects.toThrow(InvalidPathError)
  })

  it('renames between image extensions', async () => {
    await store.createUpload('', 'photo.png', PNG)

    await move('photo.png', 'picture.png')

    await expect(store.readBytes('picture.png')).resolves.toStrictEqual(PNG)
  })
})

describe('moving', () => {
  it('moves a document into another folder', async () => {
    await store.createFolder('archive', '# archive')
    await store.createDocument('notes.md', '# hello')

    await move('notes.md', 'archive/notes.md')

    await expect(store.read('archive/notes.md')).resolves.toBe('# hello')
  })

  it('creates the destination parent when it does not exist', async () => {
    await store.createDocument('notes.md', '# hello')

    await move('notes.md', 'deeply/nested/notes.md')

    await expect(store.read('deeply/nested/notes.md')).resolves.toBe('# hello')
  })

  it('moves a folder with everything under it', async () => {
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/entry.md', '# entry')

    await move('journal', 'archive/journal')

    await expect(store.read('archive/journal/entry.md')).resolves.toBe('# entry')
    expect(await exists('journal')).toBe(false)
  })

  it('treats a move onto its own path as a no-op, which is what a drag home amounts to', async () => {
    await store.createDocument('notes.md', '# hello')

    await move('notes.md', 'notes.md')

    await expect(store.read('notes.md')).resolves.toBe('# hello')
  })
})

describe('rejecting impossible moves', () => {
  it('refuses to move a folder into its own descendant', async () => {
    await store.createFolder('journal', '# journal')

    await expect(move('journal', 'journal/2026')).rejects.toThrow(InvalidMoveError)
  })

  it('refuses a deeper descendant too', async () => {
    await store.createFolder('journal/2026', '# journal')

    await expect(move('journal', 'journal/2026/nested')).rejects.toThrow(InvalidMoveError)
  })

  it('allows a sibling whose name merely starts with the source name', async () => {
    await store.createFolder('journal', '# journal')

    await move('journal', 'journal-archive')

    expect(await exists('journal-archive', 'index.md')).toBe(true)
  })

  it('throws DocumentNotFoundError when the source is not there', async () => {
    await expect(move('missing.md', 'elsewhere.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it.each([
    ['a traversal in the source', '../escape.md', 'notes.md'],
    ['a traversal in the destination', 'notes.md', '../escape.md'],
    ['the trash as a source', '.trash', 'notes'],
    ['the trash as a destination', 'notes.md', '.trash/notes.md'],
    ['an empty source', '', 'notes.md'],
    ['an empty destination', 'notes.md', ''],
  ])('rejects %s', async (_label, from, to) => {
    await expect(move(from, to)).rejects.toThrow(InvalidPathError)
  })

  it('refuses to move a file the app does not manage', async () => {
    await fs.writeFile(path.join(root, 'payload.zip'), 'x')

    await expect(move('payload.zip', 'archive.zip')).rejects.toThrow(InvalidPathError)
  })
})

describe('an occupied destination', () => {
  it('refuses rather than replacing a file', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await expect(move('notes.md', 'archive/notes.md')).rejects.toThrow(EntryExistsError)
  })

  it('refuses rather than merging two folders', async () => {
    await store.createFolder('journal', '# journal')
    await store.createFolder('archive/journal', '# other')

    await expect(move('journal', 'archive/journal')).rejects.toThrow(EntryExistsError)
  })

  it('leaves both sides untouched when it refuses', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await expect(move('notes.md', 'archive/notes.md')).rejects.toThrow(EntryExistsError)

    await expect(store.read('notes.md')).resolves.toBe('# mine')
    await expect(store.read('archive/notes.md')).resolves.toBe('# theirs')
  })

  it('trashes nothing, so no recovery is needed', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await move('notes.md', 'archive/notes.md').catch(() => undefined)

    await expect(store.listTrash()).resolves.toStrictEqual([])
  })
})
