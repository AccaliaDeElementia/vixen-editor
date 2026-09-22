'use sanity'

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createFsDocumentStore,
  DocumentNotFoundError,
  type DocumentStore,
} from '../../../src/server/storage/fs-store.ts'
import { InvalidDocumentIdError } from '../../../src/server/storage/safe-path.ts'

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

describe('write', () => {
  it('creates a document', async () => {
    await store.write('notes.md', '# hello')

    await expect(fs.readFile(path.join(root, 'notes.md'), 'utf8')).resolves.toBe('# hello')
  })

  it('creates missing parent directories', async () => {
    await store.write('journal/2026/september.md', 'entry')

    await expect(fs.readFile(path.join(root, 'journal/2026/september.md'), 'utf8')).resolves.toBe('entry')
  })

  it('creates the document root if it does not yet exist', async () => {
    const fresh = createFsDocumentStore(path.join(root, 'nested', 'deeper'))
    await fresh.write('notes.md', 'body')

    await expect(fresh.read('notes.md')).resolves.toBe('body')
  })

  it('overwrites an existing document', async () => {
    await store.write('notes.md', 'first')
    await store.write('notes.md', 'second')

    await expect(store.read('notes.md')).resolves.toBe('second')
  })

  it('stores an empty document', async () => {
    await store.write('empty.md', '')

    await expect(store.read('empty.md')).resolves.toBe('')
  })

  it('round-trips unicode content', async () => {
    await store.write('unicode.md', '# ✨ héllo 世界')

    await expect(store.read('unicode.md')).resolves.toBe('# ✨ héllo 世界')
  })

  it('rejects an invalid id', async () => {
    await expect(store.write('../escape.md', 'x')).rejects.toThrow(InvalidDocumentIdError)
  })
})

describe('read', () => {
  it('returns the stored content', async () => {
    await store.write('notes.md', 'content')

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
    await expect(store.read('../../etc/passwd.md')).rejects.toThrow(InvalidDocumentIdError)
  })

  it('surfaces a genuine filesystem fault rather than reporting it as missing', async () => {
    // NAME_MAX is 255, so a longer filename yields ENAMETOOLONG rather than ENOENT.
    await expect(store.read(`${'a'.repeat(300)}.md`)).rejects.toThrow(expect.objectContaining({ code: 'ENAMETOOLONG' }))
  })

  it('refuses to follow a well-formed id whose symlink escapes the root', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(root, 'innocent.md'))

    await expect(store.read('innocent.md')).rejects.toThrow(InvalidDocumentIdError)
  })

  it('refuses to read through a symlinked directory that escapes the root', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
    await fs.symlink(outside, path.join(root, 'link'))

    await expect(store.read('link/secret.md')).rejects.toThrow(InvalidDocumentIdError)
  })

  it('allows a symlink that stays inside the root', async () => {
    await store.write('real.md', 'inside')
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
    await store.write('b.md', '')
    await store.write('a.md', '')

    await expect(store.list()).resolves.toStrictEqual(['a.md', 'b.md'])
  })

  it('lists nested documents with posix separators', async () => {
    await store.write('journal/2026/september.md', '')

    await expect(store.list()).resolves.toStrictEqual(['journal/2026/september.md'])
  })

  it('ignores files that are not markdown', async () => {
    await store.write('notes.md', '')
    await fs.writeFile(path.join(root, 'image.png'), '')
    await fs.writeFile(path.join(root, 'README'), '')

    await expect(store.list()).resolves.toStrictEqual(['notes.md'])
  })

  it('ignores dotfiles and dot-directories', async () => {
    await store.write('notes.md', '')
    await fs.writeFile(path.join(root, '.hidden.md'), '')
    await fs.mkdir(path.join(root, '.git'), { recursive: true })
    await fs.writeFile(path.join(root, '.git', 'config.md'), '')

    await expect(store.list()).resolves.toStrictEqual(['notes.md'])
  })
})

describe('remove', () => {
  it('deletes a document', async () => {
    await store.write('notes.md', 'x')
    await store.remove('notes.md')

    await expect(store.read('notes.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('throws DocumentNotFoundError for a missing document', async () => {
    await expect(store.remove('missing.md')).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects an invalid id', async () => {
    await expect(store.remove('../escape.md')).rejects.toThrow(InvalidDocumentIdError)
  })

  it('leaves other documents untouched', async () => {
    await store.write('a.md', 'a')
    await store.write('b.md', 'b')
    await store.remove('a.md')

    await expect(store.list()).resolves.toStrictEqual(['b.md'])
  })
})
