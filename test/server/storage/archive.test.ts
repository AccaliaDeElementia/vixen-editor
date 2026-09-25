'use sanity'

import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { planArchive } from '../../../src/server/storage/archive.ts'
import { createFsDocumentStore, type DocumentStore } from '../../../src/server/storage/fs-store.ts'
import { InvalidPathError } from '../../../src/server/storage/safe-path.ts'
import { ArchiveTooLargeError, DocumentNotFoundError } from '../../../src/server/storage/store-errors.ts'

const GENEROUS = { maxBytes: 1_000_000, maxEntries: 1000 }

let root = ''
let store: DocumentStore = createFsDocumentStore('')
let outside = ''

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-archive-'))
  root = path.join(base, 'docs')
  outside = path.join(base, 'outside')
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(outside, { recursive: true })
  store = createFsDocumentStore(root)
})

afterEach(async () => {
  await fs.rm(path.dirname(root), { recursive: true, force: true })
})

describe('planArchive', () => {
  it('measures nothing for an empty store', async () => {
    const plan = await planArchive(root, '', GENEROUS)

    expect(plan).toMatchObject({ files: [], directories: [], totalBytes: 0 })
  })

  it('collects every managed file with its size', async () => {
    await store.createDocument('notes.md', '1234567')
    await store.createDocument('journal/entry.md', '12345')

    const plan = await planArchive(root, '', GENEROUS)

    expect(plan.files.sort((a, b) => a.localeCompare(b))).toStrictEqual(['journal/entry.md', 'notes.md'])
    expect(plan.totalBytes).toBe(12)
  })

  it('keeps an empty folder, which nothing else in the zip would imply', async () => {
    await fs.mkdir(path.join(root, 'empty'), { recursive: true })

    const plan = await planArchive(root, '', GENEROUS)

    expect(plan.directories).toStrictEqual(['empty'])
  })

  it('does not list a folder that its own contents already imply', async () => {
    await store.createDocument('journal/entry.md', 'x')

    const plan = await planArchive(root, '', GENEROUS)

    expect(plan.directories).toStrictEqual([])
  })

  it('omits a file the app does not manage', async () => {
    await store.createDocument('notes.md', 'x')
    await fs.writeFile(path.join(root, 'payload.zip'), 'x')

    const plan = await planArchive(root, '', GENEROUS)

    expect(plan.files).toStrictEqual(['notes.md'])
  })

  it('omits a symlink that escapes the root, so an export cannot exfiltrate', async () => {
    await fs.writeFile(path.join(outside, 'secret.md'), 'classified')
    await fs.symlink(path.join(outside, 'secret.md'), path.join(root, 'innocent.md'))

    const plan = await planArchive(root, '', GENEROUS)

    expect(plan.files).toStrictEqual([])
  })

  it('rejects an entry count over the limit', async () => {
    await store.createDocument('a.md', 'x')
    await store.createDocument('b.md', 'x')

    await expect(planArchive(root, '', { ...GENEROUS, maxEntries: 1 })).rejects.toThrow(ArchiveTooLargeError)
  })

  it('rejects a byte total over the limit', async () => {
    await store.createDocument('a.md', 'a longer document than the limit allows')

    await expect(planArchive(root, '', { ...GENEROUS, maxBytes: 4 })).rejects.toThrow(ArchiveTooLargeError)
  })

  it('reports the limit and the measurement that broke it', async () => {
    await store.createDocument('a.md', 'x')
    await store.createDocument('b.md', 'x')

    const error = await planArchive(root, '', { ...GENEROUS, maxEntries: 1 }).catch((thrown: unknown) => thrown)

    expect(error).toMatchObject({ unit: 'entries', limit: 1, measured: 2 })
  })

  it('accepts a total exactly at the limit', async () => {
    await store.createDocument('a.md', 'abcd')

    await expect(planArchive(root, '', { ...GENEROUS, maxBytes: 4 })).resolves.toMatchObject({ totalBytes: 4 })
  })

  it('throws DocumentNotFoundError for a subtree that is not there', async () => {
    await expect(planArchive(root, 'missing', GENEROUS)).rejects.toThrow(DocumentNotFoundError)
  })

  it('throws DocumentNotFoundError when the subtree names a file', async () => {
    await store.createDocument('notes.md', 'x')

    await expect(planArchive(root, 'notes.md', GENEROUS)).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects a traversal attempt', async () => {
    await expect(planArchive(root, '../outside', GENEROUS)).rejects.toThrow(InvalidPathError)
  })

  it('refuses to reach into the trash', async () => {
    await expect(planArchive(root, '.trash', GENEROUS)).rejects.toThrow(InvalidPathError)
  })
})

describe('archive', () => {
  it('streams rather than buffering, so a large export never lands in memory', async () => {
    await store.createDocument('notes.md', '# hello')

    const stream = await store.archive('', GENEROUS)

    expect(stream).toBeInstanceOf(ReadableStream)
  })

  it('produces a readable zip', async () => {
    await store.createDocument('notes.md', '# hello')

    const stream = await store.archive('', GENEROUS)
    const bytes = Buffer.from(await new Response(stream).arrayBuffer())

    expect(bytes.subarray(0, 2).toString('ascii')).toBe('PK')
    expect(bytes.includes(Buffer.from('notes.md'))).toBe(true)
  })

  it('carries an empty folder into the zip, so the structure survives a round trip', async () => {
    await fs.mkdir(path.join(root, 'empty'), { recursive: true })

    const stream = await store.archive('', GENEROUS)
    const bytes = Buffer.from(await new Response(stream).arrayBuffer())

    expect(bytes.includes(Buffer.from('empty/'))).toBe(true)
  })

  it('does not take the write lock, so a download cannot block a save', async () => {
    await store.createDocument('notes.md', '# hello')
    const stream = await store.archive('', GENEROUS)

    const etag = await store.createDocument('during-download.md', '# written while downloading')

    expect(etag).toBeTruthy()
    await new Response(stream).arrayBuffer()
  })
})
