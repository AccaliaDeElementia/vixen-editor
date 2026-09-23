'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ConcurrentModificationError,
  createFsDocumentStore,
  DocumentNotFoundError,
  EmptyContentError,
  EntryExistsError,
  FOLDER_INDEX_NAME,
  type DocumentStore,
} from '../../../src/server/storage/fs-store.ts'
import { InvalidPathError } from '../../../src/server/storage/safe-path.ts'

let root: string
let outside: string
let store: DocumentStore

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-'))
  root = path.join(base, 'docs')
  outside = path.join(base, 'outside')
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(outside, { recursive: true })
  store = createFsDocumentStore(root)
})

afterEach(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true })
})

describe('read', () => {
  it('returns the stored content', async () => {
    await store.createDocument('notes.md', 'content')

    await expect(store.read('notes.md')).resolves.toBe('content')
  })

  it('throws DocumentNotFoundError for a missing document', async () => {
    await expect(store.read('missing.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('names the missing document in the error', async () => {
    await expect(store.read('missing.md')).rejects.toThrow(/missing\.md/)
  })

  it('throws DocumentNotFoundError when the id names a directory', async () => {
    await fs.mkdir(path.join(root, 'adirectory.md'), { recursive: true })

    await expect(store.read('adirectory.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects an invalid id', async () => {
    await expect(store.read('../../etc/passwd.md')).rejects.toThrow(InvalidPathError)
  })

  it('surfaces a genuine filesystem fault rather than reporting it as missing', async () => {
    // NAME_MAX is 255, so a longer filename yields ENAMETOOLONG rather than ENOENT.
    await expect(store.read(`${'a'.repeat(300)}.md`)).rejects.toThrow(expect.objectContaining({ code: 'ENAMETOOLONG' }))
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
    await store.createDocument('real.md', 'inside')
    await fs.symlink(path.join(root, 'real.md'), path.join(root, 'alias.md'))

    await expect(store.read('alias.md')).resolves.toBe('inside')
  })
})

describe('list', () => {
  it('returns an empty array when there are no documents', async () => {
    await expect(store.list()).resolves.toStrictEqual([])
  })

  it('returns an empty array when the root does not exist', async () => {
    const missing = createFsDocumentStore(path.join(root, 'does-not-exist'))

    await expect(missing.list()).resolves.toStrictEqual([])
  })

  it('surfaces a genuine filesystem fault rather than returning an empty list', async () => {
    // NAME_MAX is 255, so a longer directory name yields ENAMETOOLONG rather than ENOENT.
    const unusable = createFsDocumentStore(path.join(root, 'b'.repeat(300)))

    await expect(unusable.list()).rejects.toThrow(expect.objectContaining({ code: 'ENAMETOOLONG' }))
  })

  it('lists documents sorted by id', async () => {
    await store.createDocument('b.md', 'x')
    await store.createDocument('a.md', 'x')

    await expect(store.list()).resolves.toStrictEqual(['a.md', 'b.md'])
  })

  it('lists nested documents with posix separators', async () => {
    await store.createDocument('journal/2026/september.md', 'x')

    await expect(store.list()).resolves.toStrictEqual(['journal/2026/september.md'])
  })

  it('lists plain text alongside markdown, because both are documents', async () => {
    await store.createDocument('notes.md', 'x')
    await store.createDocument('notes.txt', 'x')

    await expect(store.list()).resolves.toStrictEqual(['notes.md', 'notes.txt'])
  })

  it('ignores files that are not documents', async () => {
    await store.createDocument('notes.md', 'x')
    await fs.writeFile(path.join(root, 'image.png'), '')
    await fs.writeFile(path.join(root, 'README'), '')

    await expect(store.list()).resolves.toStrictEqual(['notes.md'])
  })

  it('ignores dotfiles and dot-directories', async () => {
    await store.createDocument('notes.md', 'x')
    await fs.writeFile(path.join(root, '.hidden.md'), '')
    await fs.mkdir(path.join(root, '.git'), { recursive: true })
    await fs.writeFile(path.join(root, '.git', 'config.md'), '')

    await expect(store.list()).resolves.toStrictEqual(['notes.md'])
  })
})

describe('remove', () => {
  it('deletes a document', async () => {
    await store.createDocument('notes.md', 'x')
    await store.remove('notes.md')

    await expect(store.read('notes.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('throws DocumentNotFoundError for a missing document', async () => {
    await expect(store.remove('missing.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects an invalid id', async () => {
    await expect(store.remove('../escape.md')).rejects.toThrow(InvalidPathError)
  })

  it('leaves other documents untouched', async () => {
    await store.createDocument('a.md', 'a')
    await store.createDocument('b.md', 'b')
    await store.remove('a.md')

    await expect(store.list()).resolves.toStrictEqual(['b.md'])
  })
})

describe('createDocument', () => {
  it('creates a document with the content it was given', async () => {
    await store.createDocument('notes.md', '# seeded')

    await expect(store.read('notes.md')).resolves.toBe('# seeded')
  })

  it('creates missing parent directories', async () => {
    await store.createDocument('journal/2026/september.md', 'entry')

    await expect(store.read('journal/2026/september.md')).resolves.toBe('entry')
  })

  it('refuses to replace an existing document', async () => {
    await store.createDocument('notes.md', 'original')

    await expect(store.createDocument('notes.md', 'replacement')).rejects.toThrow(EntryExistsError)
  })

  it('leaves the existing content untouched when it refuses', async () => {
    await store.createDocument('notes.md', 'original')

    await expect(store.createDocument('notes.md', 'replacement')).rejects.toThrow(EntryExistsError)
    await expect(store.read('notes.md')).resolves.toBe('original')
  })

  it('names the taken path in the error', async () => {
    await store.createDocument('notes.md', 'original')

    await expect(store.createDocument('notes.md', 'x')).rejects.toThrow(/notes\.md/)
  })

  it('refuses a path occupied by a directory', async () => {
    await fs.mkdir(path.join(root, 'notes.md'), { recursive: true })

    await expect(store.createDocument('notes.md', 'x')).rejects.toThrow(EntryExistsError)
  })

  it('rejects an invalid id', async () => {
    await expect(store.createDocument('../escape.md', 'x')).rejects.toThrow(InvalidPathError)
  })

  it('rejects a hidden id', async () => {
    await expect(store.createDocument('.hidden.md', 'x')).rejects.toThrow(InvalidPathError)
  })

  it('refuses to create through a symlinked directory that escapes the root', async () => {
    await fs.symlink(outside, path.join(root, 'link'))

    await expect(store.createDocument('link/planted.md', 'x')).rejects.toThrow(InvalidPathError)
  })

  it('surfaces a genuine filesystem fault rather than reporting the path as taken', async () => {
    // NAME_MAX is 255, so a longer filename yields ENAMETOOLONG rather than EEXIST.
    await expect(store.createDocument(`${'a'.repeat(300)}.md`, 'x')).rejects.toThrow(
      expect.objectContaining({ code: 'ENAMETOOLONG' }),
    )
  })

  it('creates the document root if it does not yet exist', async () => {
    const fresh = createFsDocumentStore(path.join(root, 'nested', 'deeper'))
    await fresh.createDocument('notes.md', 'body')

    await expect(fresh.read('notes.md')).resolves.toBe('body')
  })

  it('round-trips unicode content', async () => {
    await store.createDocument('unicode.md', '# ✨ héllo 世界')

    await expect(store.read('unicode.md')).resolves.toBe('# ✨ héllo 世界')
  })

  it('stores a plain text document', async () => {
    await store.createDocument('notes.txt', 'plain')

    await expect(store.read('notes.txt')).resolves.toBe('plain')
  })

  it.each([
    ['empty content', ''],
    ['whitespace-only content', '  \n\t '],
  ])('refuses %s', async (_label, content) => {
    await expect(store.createDocument('empty.md', content)).rejects.toThrow(EmptyContentError)
  })

  it('returns an etag the caller can save against', async () => {
    const etag = await store.createDocument('notes.md', '# hello')

    await expect(store.updateDocument('notes.md', '# changed', etag)).resolves.toBeTruthy()
  })
})

describe('updateDocument', () => {
  async function seeded(content = 'original'): Promise<string> {
    return await store.createDocument('notes.md', content)
  }

  it('replaces the content when the etag matches', async () => {
    const etag = await seeded()

    await store.updateDocument('notes.md', 'replaced', etag)

    await expect(store.read('notes.md')).resolves.toBe('replaced')
  })

  it('returns an etag matching the new content, so a second save needs no re-read', async () => {
    const etag = await seeded()

    const next = await store.updateDocument('notes.md', 'replaced', etag)
    await store.updateDocument('notes.md', 'again', next)

    await expect(store.read('notes.md')).resolves.toBe('again')
  })

  it('rejects a stale etag rather than clobbering the newer content', async () => {
    const stale = await seeded()
    await store.updateDocument('notes.md', 'someone else got here first', stale)

    await expect(store.updateDocument('notes.md', 'mine', stale)).rejects.toThrow(ConcurrentModificationError)
  })

  it('leaves the newer content in place when it rejects a stale etag', async () => {
    const stale = await seeded()
    await store.updateDocument('notes.md', 'theirs', stale)

    await expect(store.updateDocument('notes.md', 'mine', stale)).rejects.toThrow(ConcurrentModificationError)
    await expect(store.read('notes.md')).resolves.toBe('theirs')
  })

  it('rejects an etag for entirely different content', async () => {
    await seeded()

    await expect(store.updateDocument('notes.md', 'mine', '"not-an-etag"')).rejects.toThrow(ConcurrentModificationError)
  })

  it('refuses to create a document that does not exist, which is what the create endpoint is for', async () => {
    await expect(store.updateDocument('absent.md', 'x', '"whatever"')).rejects.toThrow(DocumentNotFoundError)
  })

  it.each([
    ['empty content', ''],
    ['whitespace-only content', '  \n\t '],
  ])('refuses %s', async (_label, content) => {
    const etag = await seeded()

    await expect(store.updateDocument('notes.md', content, etag)).rejects.toThrow(EmptyContentError)
  })

  it('leaves the stored content alone when it refuses an empty save', async () => {
    const etag = await seeded()

    await expect(store.updateDocument('notes.md', '', etag)).rejects.toThrow(EmptyContentError)
    await expect(store.read('notes.md')).resolves.toBe('original')
  })

  it('rejects an invalid id', async () => {
    await expect(store.updateDocument('../escape.md', 'x', '"e"')).rejects.toThrow(InvalidPathError)
  })

  it('refuses to follow a symlink that escapes the root', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(root, 'innocent.md'))

    await expect(store.updateDocument('innocent.md', 'x', '"e"')).rejects.toThrow(InvalidPathError)
  })

  // Without the write lock both saves read the same content, both find their
  // etag current, and both write: the precondition passes and the first change
  // is lost anyway. Serialising the read-modify-write is what closes that.
  it('lets only one of two concurrent saves holding the same etag through', async () => {
    const etag = await store.createDocument('notes.md', 'original')

    const outcomes = await Promise.allSettled([
      store.updateDocument('notes.md', 'first writer', etag),
      store.updateDocument('notes.md', 'second writer', etag),
    ])

    expect(outcomes.map((outcome) => outcome.status)).toContain('rejected')
    expect(outcomes.filter((outcome) => outcome.status === 'fulfilled')).toHaveLength(1)
  })

  it('reports the loser of two concurrent saves as a conflict, not as a silent success', async () => {
    const etag = await store.createDocument('notes.md', 'original')

    const outcomes = await Promise.allSettled([
      store.updateDocument('notes.md', 'first writer', etag),
      store.updateDocument('notes.md', 'second writer', etag),
    ])
    const rejection = outcomes.find((outcome) => outcome.status === 'rejected')

    expect(rejection?.reason).toBeInstanceOf(ConcurrentModificationError)
  })
})

describe('createFolder', () => {
  it('creates the directory', async () => {
    await store.createFolder('journal', '# journal')

    await expect(fs.stat(path.join(root, 'journal')).then((s) => s.isDirectory())).resolves.toBe(true)
  })

  it('seeds the folder with an index document, so it opens to something', async () => {
    await store.createFolder('journal', '# journal')

    await expect(store.read(`journal/${FOLDER_INDEX_NAME}`)).resolves.toBe('# journal')
  })

  it('creates missing parent directories', async () => {
    await store.createFolder('journal/2026/september', '# september')

    await expect(store.read(`journal/2026/september/${FOLDER_INDEX_NAME}`)).resolves.toBe('# september')
  })

  it('refuses a folder that already exists, rather than overwriting its index', async () => {
    await store.createFolder('journal', '# journal')

    await expect(store.createFolder('journal', '# again')).rejects.toThrow(EntryExistsError)
  })

  it('leaves the existing index untouched when it refuses', async () => {
    await store.createFolder('journal', '# journal')

    await expect(store.createFolder('journal', '# again')).rejects.toThrow(EntryExistsError)
    await expect(store.read(`journal/${FOLDER_INDEX_NAME}`)).resolves.toBe('# journal')
  })

  it('refuses a path already occupied by a file', async () => {
    await store.createDocument('journal.md', 'x')

    await expect(store.createFolder('journal.md', '# journal')).rejects.toThrow(EntryExistsError)
  })

  it('rejects an invalid path', async () => {
    await expect(store.createFolder('../escape', '# x')).rejects.toThrow(InvalidPathError)
  })

  it('rejects a hidden path, which is how the trash stays unreachable', async () => {
    await expect(store.createFolder('.trash', '# x')).rejects.toThrow(InvalidPathError)
  })

  it('refuses to create through a symlinked directory that escapes the root', async () => {
    await fs.symlink(outside, path.join(root, 'link'))

    await expect(store.createFolder('link/planted', '# x')).rejects.toThrow(InvalidPathError)
  })

  it('surfaces a genuine filesystem fault rather than reporting the path as taken', async () => {
    // NAME_MAX is 255, so a longer directory name yields ENAMETOOLONG rather than EEXIST.
    await expect(store.createFolder('b'.repeat(300), '# x')).rejects.toThrow(
      expect.objectContaining({ code: 'ENAMETOOLONG' }),
    )
  })
})

describe('tree', () => {
  it('reports the document tree', async () => {
    await store.createDocument('journal/september.md', 'x')

    await expect(store.tree()).resolves.toMatchObject([
      { name: 'journal', kind: 'folder', children: [{ name: 'september.md', kind: 'document' }] },
    ])
  })

  it('reports an empty tree for an empty root', async () => {
    await expect(store.tree()).resolves.toStrictEqual([])
  })
})
