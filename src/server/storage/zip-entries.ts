'use sanity'

import { Buffer } from 'node:buffer'
import yauzl from 'yauzl'

import type { ArchiveEntry } from './archive-entry.ts'

const NO_FLAGS = 0
const UTF8_NAMES = 0x800
const ENCRYPTED = 0x1
const UNIX_MODE_SHIFT = 16
const FILE_TYPE_MASK = 0o170000
const REGULAR_FILE = 0o100000
const NO_UNIX_MODE = 0
const HIGHEST_ASCII = 0x7f
const DIRECTORY_SUFFIX = '/'

function nameOf(raw: Buffer, flags: number): string | null {
  if ((flags & UTF8_NAMES) !== NO_FLAGS) return raw.toString('utf8')

  return raw.every((byte) => byte <= HIGHEST_ASCII) ? raw.toString('latin1') : null
}

function kindOf(name: string | null, externalAttributes: number): ArchiveEntry['kind'] {
  if (name?.endsWith(DIRECTORY_SUFFIX) === true) return 'directory'

  const mode = externalAttributes >>> UNIX_MODE_SHIFT
  if (mode === NO_UNIX_MODE) return 'file'

  return (mode & FILE_TYPE_MASK) === REGULAR_FILE ? 'file' : 'other'
}

type Visit = (entry: yauzl.Entry, name: string | null, archive: yauzl.ZipFile) => void

async function walkZip(archivePath: string, visit: Visit): Promise<void> {
  const settled: PromiseWithResolvers<void> = Promise.withResolvers()

  yauzl.open(archivePath, { lazyEntries: true, decodeStrings: false }, (openError, archive) => {
    if (openError !== null) {
      settled.reject(openError)

      return
    }

    archive.on('entry', (entry: yauzl.Entry) => {
      visit(entry, nameOf(Buffer.from(entry.fileName), entry.generalPurposeBitFlag), archive)
    })
    /* v8 ignore next 3 -- yauzl reports a bad archive through its open callback, so nothing
       reaches this; an error event with no listener would end the process */
    archive.on('error', (error: Error) => {
      settled.reject(error)
    })
    archive.on('end', () => {
      settled.resolve()
    })
    archive.readEntry()
  })

  await settled.promise
}

export async function readZipEntries(archivePath: string): Promise<ArchiveEntry[]> {
  const found: ArchiveEntry[] = []

  await walkZip(archivePath, (entry, name, archive) => {
    found.push({
      name,
      kind: kindOf(name, entry.externalFileAttributes),
      declaredBytes: entry.uncompressedSize,
      encrypted: (entry.generalPurposeBitFlag & ENCRYPTED) !== NO_FLAGS,
    })
    archive.readEntry()
  })

  return found
}

async function bytesOf(archive: yauzl.ZipFile, entry: yauzl.Entry): Promise<Uint8Array> {
  const settled: PromiseWithResolvers<Uint8Array> = Promise.withResolvers()

  archive.openReadStream(entry, (streamError, contents) => {
    /* v8 ignore next 5 -- an entry listed in the directory opens; a mismatch between what it
       claims and what it holds arrives on the stream below instead */
    if (streamError !== null) {
      settled.reject(streamError)

      return
    }

    const chunks: Uint8Array[] = []
    contents.on('data', (chunk: Uint8Array) => {
      chunks.push(chunk)
    })
    contents.on('error', (error: Error) => {
      settled.reject(error)
    })
    contents.on('end', () => {
      settled.resolve(Buffer.concat(chunks))
    })
  })

  return await settled.promise
}

type TakeEntry = (name: string, bytes: Uint8Array) => Promise<void> | void

interface HandingOver {
  archive: yauzl.ZipFile
  entry: yauzl.Entry
  name: string
  take: TakeEntry
  settled: PromiseWithResolvers<void>
}

async function handOver({ archive, entry, name, take, settled }: HandingOver): Promise<void> {
  try {
    await take(name, await bytesOf(archive, entry))
    archive.readEntry()
  } catch (error) {
    settled.reject(error)
  }
}

export async function eachZipFile(archivePath: string, wanted: ReadonlySet<string>, take: TakeEntry): Promise<void> {
  const settled: PromiseWithResolvers<void> = Promise.withResolvers()

  const walked = walkZip(archivePath, (entry, name, archive) => {
    if (name === null || !wanted.has(name)) archive.readEntry()
    else void handOver({ archive, entry, name, take, settled })
  })

  await Promise.race([
    walked.then(() => {
      settled.resolve()
    }),
    settled.promise,
  ])
  await settled.promise
}
