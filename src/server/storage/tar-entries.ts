'use sanity'

import { Buffer } from 'node:buffer'
import { createReadStream } from 'node:fs'
import { Readable } from 'node:stream'
import { createGunzip } from 'node:zlib'

import { createTarDecoder, type ParsedTarEntry, type TarHeader } from 'modern-tar'

import type { ArchiveEntry } from './archive-entry.ts'

const NEVER_ENCRYPTED = false
const REGULAR_KINDS: ReadonlyArray<TarHeader['type']> = [undefined, 'file']

function kindOf(type: TarHeader['type']): ArchiveEntry['kind'] {
  if (type === 'directory') return 'directory'

  return REGULAR_KINDS.includes(type) ? 'file' : 'other'
}

function entriesOf(archivePath: string): ReadableStream<ParsedTarEntry> {
  const unpacked = createReadStream(archivePath).pipe(createGunzip())

  return Readable.toWeb(unpacked).pipeThrough(createTarDecoder())
}

async function walkTar(
  archivePath: string,
  visit: (header: TarHeader, body: ReadableStream<Uint8Array>) => Promise<void>,
): Promise<void> {
  for await (const entry of entriesOf(archivePath)) await visit(entry.header, entry.body)
}

export async function readTarEntries(archivePath: string): Promise<ArchiveEntry[]> {
  const found: ArchiveEntry[] = []

  await walkTar(archivePath, async (header, body) => {
    found.push({
      name: header.name,
      kind: kindOf(header.type),
      declaredBytes: header.size,
      encrypted: NEVER_ENCRYPTED,
    })
    await body.cancel()
  })

  return found
}

async function bytesOf(body: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  for await (const chunk of body) chunks.push(chunk)

  return Buffer.concat(chunks)
}

export async function eachTarFile(
  archivePath: string,
  wanted: ReadonlySet<string>,
  take: (name: string, bytes: Uint8Array) => Promise<void> | void,
): Promise<void> {
  await walkTar(archivePath, async (header, body) => {
    if (!wanted.has(header.name)) {
      await body.cancel()

      return
    }

    await take(header.name, await bytesOf(body))
  })
}
