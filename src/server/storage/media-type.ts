'use sanity'

import { extensionOf } from './safe-path.ts'

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}

// Never derived from the upload's own Content-Type, which the client chooses.
// An unrecognised extension gets the opaque type rather than a guess, so a
// browser has nothing to sniff towards.
export const FALLBACK_MEDIA_TYPE = 'application/octet-stream'

export function mediaTypeOf(entryPath: string): string {
  return MEDIA_TYPES[extensionOf(entryPath)] ?? FALLBACK_MEDIA_TYPE
}
