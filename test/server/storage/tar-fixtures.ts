'use sanity'

import { gzipSync } from 'node:zlib'
import { packTar, type TarHeader } from 'modern-tar'

const NO_BYTES = 0

export interface TarFixtureEntry {
  name: string
  bytes?: Uint8Array
  type?: TarHeader['type']
  linkname?: string
}

export async function tarGzOf(entries: readonly TarFixtureEntry[]): Promise<Uint8Array<ArrayBuffer>> {
  const packed = await packTar(
    entries.map(({ name, bytes, type, linkname }) => ({
      header: {
        name,
        size: bytes?.length ?? NO_BYTES,
        ...(type === undefined ? {} : { type }),
        ...(linkname === undefined ? {} : { linkname }),
      },
      body: bytes ?? null,
    })),
  )
  const compressed = gzipSync(packed)
  const bytes = new Uint8Array(new ArrayBuffer(compressed.length))
  bytes.set(compressed)

  return bytes
}
