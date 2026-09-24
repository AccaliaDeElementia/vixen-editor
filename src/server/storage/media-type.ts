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

const FALLBACK_MEDIA_TYPE = 'application/octet-stream'

export function mediaTypeOf(entryPath: string): string {
  return MEDIA_TYPES[extensionOf(entryPath)] ?? FALLBACK_MEDIA_TYPE
}

export const TestOnly = { FALLBACK_MEDIA_TYPE }
