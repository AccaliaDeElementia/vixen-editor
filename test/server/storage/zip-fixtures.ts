'use sanity'

import { zipSync } from 'fflate'

const UTF8_FLAG = 0x800
const UNIX_MODE_SHIFT = 16
const NO_BYTES = new Uint8Array()

export interface FixtureEntry {
  name: string
  bytes?: Uint8Array
  mode?: number
}

// fflate writes a name exactly as given, where yazl refuses an absolute or
// traversing one -- so a hostile archive can only be built with a second writer.
export function zipOf(entries: readonly FixtureEntry[]): Uint8Array<ArrayBuffer> {
  const shaped: Record<string, [Uint8Array, { os?: number; attrs?: number }]> = {}
  for (const { name, bytes = NO_BYTES, mode } of entries) {
    shaped[name] = [bytes, mode === undefined ? {} : { os: 3, attrs: mode << UNIX_MODE_SHIFT }]
  }

  const written = zipSync(shaped)
  const bytes = new Uint8Array(new ArrayBuffer(written.length))
  bytes.set(written)

  return bytes
}

export const SYMLINK_MODE = 0o120777
export const DIRECTORY_MODE = 0o040755
export const REGULAR_MODE = 0o100644
export const UTF8_NAME_FLAG = UTF8_FLAG
