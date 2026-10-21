'use sanity'

import { givenAsync } from '../../conditions.ts'
import { repairLinks } from '../../../src/server/markdown/relink.ts'
import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { unpackTar, type ParsedTarEntryWithData } from 'modern-tar'
import { gunzipSync } from 'node:zlib'

import { archiveStream, planArchive, type ArchiveRequest } from '../../../src/server/storage/archive.ts'
import { createFsDocumentStore, type StoreLayer } from '../../../src/server/storage/fs-store.ts'
import { InvalidPathError } from '../../../src/server/storage/primitives/safe-path.ts'
import { ArchiveTooLargeError, DocumentNotFoundError } from '../../../src/server/storage/primitives/store-errors.ts'

import { someone } from '../actors.ts'

const GENEROUS = { maxBytes: 1_000_000, maxEntries: 1000 }
const AS_ZIP: ArchiveRequest = { ...GENEROUS, format: 'zip' }
const AS_TAR: ArchiveRequest = { ...GENEROUS, format: 'tar.gz' }

let root = ''
let store: StoreLayer = createFsDocumentStore('', repairLinks)
let outside = ''

beforeEach(async () => {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'vixen-archive-'))
  root = path.join(base, 'docs')
  outside = path.join(base, 'outside')
  await fs.mkdir(root, { recursive: true })
  await fs.mkdir(outside, { recursive: true })
  store = createFsDocumentStore(root, repairLinks)
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
    await store.createDocument('notes.md', '1234567', someone)
    await store.createDocument('journal/entry.md', '12345', someone)

    const plan = await planArchive(root, '', GENEROUS)

    expect({ files: plan.files.toSorted((a, b) => a.localeCompare(b)), totalBytes: plan.totalBytes }).toStrictEqual({
      files: ['journal/entry.md', 'notes.md'],
      totalBytes: 12,
    })
  })

  it('keeps an empty folder, which nothing else in the zip would imply', async () => {
    await fs.mkdir(path.join(root, 'empty'), { recursive: true })

    const plan = await planArchive(root, '', GENEROUS)

    expect(plan.directories).toStrictEqual(['empty'])
  })

  it('does not list a folder that its own contents already imply', async () => {
    await store.createDocument('journal/entry.md', 'x', someone)

    const plan = await planArchive(root, '', GENEROUS)

    expect(plan.directories).toStrictEqual([])
  })

  it('omits a file the app does not manage', async () => {
    await store.createDocument('notes.md', 'x', someone)
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
    await store.createDocument('a.md', 'x', someone)
    await store.createDocument('b.md', 'x', someone)

    await expect(planArchive(root, '', { ...GENEROUS, maxEntries: 1 })).rejects.toThrow(ArchiveTooLargeError)
  })

  it('rejects a byte total over the limit', async () => {
    await store.createDocument('a.md', 'a longer document than the limit allows', someone)

    await expect(planArchive(root, '', { ...GENEROUS, maxBytes: 4 })).rejects.toThrow(ArchiveTooLargeError)
  })

  it('reports the limit and the measurement that broke it', async () => {
    await store.createDocument('a.md', 'x', someone)
    await store.createDocument('b.md', 'x', someone)

    const error = await planArchive(root, '', { ...GENEROUS, maxEntries: 1 }).catch((thrown: unknown) => thrown)

    expect(error).toMatchObject({ unit: 'entries', limit: 1, measured: 2 })
  })

  it('accepts an entry count exactly at the limit', async () => {
    await store.createDocument('a.md', 'x', someone)

    await expect(planArchive(root, '', { ...GENEROUS, maxEntries: 1 })).resolves.toMatchObject({ files: ['a.md'] })
  })

  it('accepts a total exactly at the limit', async () => {
    await store.createDocument('a.md', 'abcd', someone)

    await expect(planArchive(root, '', { ...GENEROUS, maxBytes: 4 })).resolves.toMatchObject({ totalBytes: 4 })
  })

  it('throws DocumentNotFoundError for a subtree that is not there', async () => {
    await expect(planArchive(root, 'missing', GENEROUS)).rejects.toThrow(DocumentNotFoundError)
  })

  it('throws DocumentNotFoundError when the subtree names a file', async () => {
    await store.createDocument('notes.md', 'x', someone)

    await expect(planArchive(root, 'notes.md', GENEROUS)).rejects.toThrow(DocumentNotFoundError)
  })

  it('rejects a traversal attempt', async () => {
    await expect(planArchive(root, '../outside', GENEROUS)).rejects.toThrow(InvalidPathError)
  })
})

describe('archive', () => {
  it('streams rather than buffering, so a large export never lands in memory', async () => {
    await store.createDocument('notes.md', '# hello', someone)

    const stream = await store.archive('', AS_ZIP)

    expect(stream).toBeInstanceOf(ReadableStream)
  })

  it('produces a readable zip', async () => {
    await store.createDocument('notes.md', '# hello', someone)

    const stream = await store.archive('', AS_ZIP)
    const bytes = Buffer.from(await new Response(stream).arrayBuffer())

    expect({
      magic: bytes.subarray(0, 2).toString('ascii'),
      names: bytes.includes(Buffer.from('notes.md')),
    }).toStrictEqual({ magic: 'PK', names: true })
  })

  it('carries an empty folder into the zip, so the structure survives a round trip', async () => {
    await fs.mkdir(path.join(root, 'empty'), { recursive: true })

    const stream = await store.archive('', AS_ZIP)
    const bytes = Buffer.from(await new Response(stream).arrayBuffer())

    expect(bytes.includes(Buffer.from('empty/'))).toBe(true)
  })

  it('does not take the write lock, so a download cannot block a save', async () => {
    await store.createDocument('notes.md', '# hello', someone)
    const stream = await store.archive('', AS_ZIP)

    const etag = await store.createDocument('during-download.md', '# written while downloading', someone)

    expect(etag).toBeTruthy()
    await new Response(stream).arrayBuffer()
  })
})

describe('archiveStream when the tree changes underneath it', () => {
  async function drain(stream: ReadableStream<Uint8Array>): Promise<number> {
    let bytes = 0
    for await (const chunk of stream) bytes += chunk.byteLength

    return bytes
  }

  it('streams the whole plan when nothing moves', async () => {
    await store.createDocument('notes.md', 'hello', someone)
    const plan = await planArchive(root, '', GENEROUS)

    await expect(drain(archiveStream(plan, 'zip'))).resolves.toBeGreaterThan(0)
  })

  async function uncaughtDuring(work: () => Promise<void>): Promise<unknown[]> {
    const raised: unknown[] = []
    const record = (error: unknown): void => {
      raised.push(error)
    }

    process.on('uncaughtException', record)
    try {
      await work()
    } finally {
      process.off('uncaughtException', record)
    }

    return raised
  }

  it('fails the download when a planned file is deleted first', async () => {
    await store.createDocument('notes.md', 'hello', someone)
    const plan = await planArchive(root, '', GENEROUS)
    await fs.rm(path.join(root, 'notes.md'))

    await expect(drain(archiveStream(plan, 'zip'))).rejects.toThrow('ENOENT')
  })

  it('raises no uncaught exception doing so, which would end the process', async () => {
    await store.createDocument('notes.md', 'hello', someone)
    const plan = await planArchive(root, '', GENEROUS)
    await fs.rm(path.join(root, 'notes.md'))

    const raised = await uncaughtDuring(async () => {
      await givenAsync(expect(drain(archiveStream(plan, 'zip'))).rejects.toThrow('ENOENT'))
    })

    expect(raised).toStrictEqual([])
  })
})

describe('archiveStream as tar.gz', () => {
  async function unpacked(stream: ReadableStream<Uint8Array>): Promise<ParsedTarEntryWithData[]> {
    return await unpackTar(gunzipSync(Buffer.from(await new Response(stream).arrayBuffer())))
  }

  it('is a gzip member, so the browser can save it under the name it is given', async () => {
    await store.createDocument('notes.md', '# hello', someone)

    const stream = await store.archive('', AS_TAR)
    const bytes = Buffer.from(await new Response(stream).arrayBuffer())

    expect([...bytes.subarray(0, 2)]).toStrictEqual([0x1f, 0x8b])
  })

  it('carries every file with the bytes the store holds', async () => {
    await store.createDocument('notes.md', '# hello', someone)
    await store.createDocument('journal/entry.md', '# entry', someone)

    const found = await unpacked(await store.archive('', AS_TAR))

    expect(found.map(({ header, data }) => [header.name, Buffer.from(data ?? []).toString('utf8')])).toStrictEqual([
      ['journal/entry.md', '# entry'],
      ['notes.md', '# hello'],
    ])
  })

  it('carries an empty folder, which nothing else in the tarball would imply', async () => {
    await fs.mkdir(path.join(root, 'empty'), { recursive: true })

    const found = await unpacked(await store.archive('', AS_TAR))

    expect(found.map(({ header }) => [header.name, header.type])).toStrictEqual([['empty/', 'directory']])
  })

  it('names no owner, so the archive says nothing about the account that built it', async () => {
    await store.createDocument('notes.md', '# hello', someone)

    const [entry] = await unpacked(await store.archive('', AS_TAR))

    expect(entry?.header).toMatchObject({ uid: 0, gid: 0, uname: '', gname: '' })
  })

  it('gives every file one mode, so no permission bit on disk reaches the download', async () => {
    await store.createDocument('notes.md', '# hello', someone)
    await fs.chmod(path.join(root, 'notes.md'), 0o777)

    const [entry] = await unpacked(await store.archive('', AS_TAR))

    expect(entry?.header.mode).toBe(0o644)
  })

  it('keeps the time the store last wrote the file', async () => {
    await store.createDocument('notes.md', '# hello', someone)
    const written = await fs.stat(path.join(root, 'notes.md'))

    const [entry] = await unpacked(await store.archive('', AS_TAR))

    expect(entry?.header.mtime?.getTime()).toBe(Math.floor(written.mtimeMs / 1000) * 1000)
  })

  it('fails the download when a planned file is deleted first', async () => {
    await store.createDocument('notes.md', 'hello', someone)
    const plan = await planArchive(root, '', GENEROUS)
    await fs.rm(path.join(root, 'notes.md'))

    await expect(new Response(archiveStream(plan, 'tar.gz')).arrayBuffer()).rejects.toThrow('ENOENT')
  })
})
