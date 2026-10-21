'use sanity'

import { STORE_ROOT } from './store-path.ts'
import type { ArchiveFormat } from './archive-formats.ts'

export const API_PREFIX = '/api'

export function rawUrlFor(entryPath: string, baseUrl: string = API_PREFIX): string {
  return `${baseUrl}/files/raw/${entryPath.split('/').map(encodeURIComponent).join('/')}`
}

export function archiveUrlFor(directory: string, format: ArchiveFormat, baseUrl: string = API_PREFIX): string {
  const subtree = directory === STORE_ROOT ? '' : `path=${encodeURIComponent(directory)}&`

  return `${baseUrl}/files/archive?${subtree}format=${encodeURIComponent(format)}`
}
