'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import { InvalidPathError } from '../../../src/server/storage/safe-path.ts'
import {
  DocumentNotFoundError,
  InvalidMoveError,
  WouldOverwriteError,
} from '../../../src/server/storage/store-errors.ts'

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])

let root: string
let store: DocumentStore

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-move-'))
  store = createFsDocumentStore(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

function move(from: string, to: string, allowOverwrite = false): Promise<void> {
  return store.move({ from, to, allowOverwrite })
}

async function exists(...parts: string[]): Promise<boolean> {
  return await fs
    .stat(path.join(root, ...parts))
    .then(() => true)
    .catch(() => false)
}

async function overwritePathsOf(attempt: Promise<void>): Promise<readonly string[]> {
  return await attempt
    .then((): readonly string[] => [])
    .catch((error: unknown) => (error instanceof WouldOverwriteError ? error.paths : []))
}

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

describe('merging folders', () => {
  it('merges into an existing folder when nothing collides', async () => {
    await store.createFolder('archive', '# archive')
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/entry.md', '# entry')
    // Both folders were seeded with an index, which would otherwise be the
    // one genuine collision and make this a test about overwriting instead.
    await store.trash('journal/index.md')

    await move('journal', 'archive')

    await expect(store.read('archive/entry.md')).resolves.toBe('# entry')
    await expect(store.read('archive/index.md')).resolves.toContain('# archive')
  })

  it('leaves files the destination already had that the source did not', async () => {
    await store.createFolder('archive', '# archive')
    await store.createDocument('archive/kept.md', '# kept')
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/entry.md', '# entry')
    await store.trash('journal/index.md')

    await move('journal', 'archive')

    await expect(store.read('archive/kept.md')).resolves.toBe('# kept')
  })

  it('removes the source folder once merged', async () => {
    await store.createFolder('archive', '# archive')
    await store.createFolder('journal', '# journal')
    await store.trash('journal/index.md')
    await store.createDocument('journal/entry.md', '# entry')

    await move('journal', 'archive')

    expect(await exists('journal')).toBe(false)
  })

  it('merges nested folders that both already exist', async () => {
    await store.createFolder('archive/2026', '# archive 2026')
    await store.createFolder('journal/2026', '# journal 2026')
    await store.createDocument('journal/2026/entry.md', '# entry')
    await store.trash('journal/2026/index.md')

    await move('journal', 'archive')

    await expect(store.read('archive/2026/entry.md')).resolves.toBe('# entry')
    await expect(store.read('archive/2026/index.md')).resolves.toContain('# archive 2026')
  })
})

describe('refusing to overwrite', () => {
  it('reports a colliding file rather than replacing it', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await expect(move('notes.md', 'archive/notes.md')).rejects.toThrow(WouldOverwriteError)
  })

  it('leaves both files untouched when it refuses', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await expect(move('notes.md', 'archive/notes.md')).rejects.toThrow(WouldOverwriteError)
    await expect(store.read('notes.md')).resolves.toBe('# mine')
    await expect(store.read('archive/notes.md')).resolves.toBe('# theirs')
  })

  it('names exactly which paths would be lost, so the dialog can show them', async () => {
    await store.createFolder('archive', '# archive')
    await store.createDocument('archive/a.md', '# theirs a')
    await store.createDocument('archive/b.md', '# theirs b')
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/a.md', '# mine a')
    await store.createDocument('journal/b.md', '# mine b')
    await store.createDocument('journal/c.md', '# mine c')

    const paths = await overwritePathsOf(move('journal', 'archive'))

    expect([...paths].sort((a, b) => a.localeCompare(b))).toStrictEqual([
      'archive/a.md',
      'archive/b.md',
      'archive/index.md',
    ])
  })

  it('reports a file that would replace a folder', async () => {
    await store.createFolder('archive/notes.md', '# oddly named folder')
    await store.createDocument('notes.md', '# mine')

    const paths = await overwritePathsOf(move('notes.md', 'archive/notes.md'))

    expect(paths).toStrictEqual(['archive/notes.md'])
  })

  it('reports a folder that would replace a file', async () => {
    await store.createDocument('archive/journal', '# not really a folder').catch(() => undefined)
    await fs.mkdir(path.join(root, 'archive'), { recursive: true })
    await fs.writeFile(path.join(root, 'archive', 'journal'), 'occupied')
    await store.createFolder('journal', '# journal')

    const paths = await overwritePathsOf(move('journal', 'archive/journal'))

    expect(paths).toStrictEqual(['archive/journal'])
  })
})

describe('confirmed overwrite', () => {
  it('replaces the colliding file when the caller allows it', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await move('notes.md', 'archive/notes.md', true)

    await expect(store.read('archive/notes.md')).resolves.toBe('# mine')
  })

  it('puts the replaced file in the trash, so a mistaken confirmation is recoverable', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await move('notes.md', 'archive/notes.md', true)

    const trashed = await store.listTrash()
    expect(trashed).toMatchObject([{ originalPath: 'archive/notes.md' }])
    await expect(store.restore(trashed[0]?.id ?? '')).rejects.toThrow()
  })

  it('keeps the replaced content in the trash entry', async () => {
    await store.createDocument('notes.md', '# mine')
    await store.createDocument('archive/notes.md', '# theirs')

    await move('notes.md', 'archive/notes.md', true)
    const [entry] = await store.listTrash()
    await store.trash('archive/notes.md')
    await store.restore(entry?.id ?? '')

    await expect(store.read('archive/notes.md')).resolves.toBe('# theirs')
  })

  it('trashes only the colliding leaves of a merge', async () => {
    await store.createFolder('archive', '# archive')
    await store.createDocument('archive/a.md', '# theirs a')
    await store.createDocument('archive/kept.md', '# kept')
    await store.createFolder('journal', '# journal')
    await store.createDocument('journal/a.md', '# mine a')

    await move('journal', 'archive', true)

    await expect(store.read('archive/a.md')).resolves.toBe('# mine a')
    await expect(store.read('archive/kept.md')).resolves.toBe('# kept')
    await expect(store.listTrash()).resolves.toHaveLength(2)
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
