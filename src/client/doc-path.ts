'use sanity'

import { FOLDER_INDEX_NAME } from '../shared/documents.ts'
import { DOC_PREFIX } from '../shared/doc-url.ts'

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

export function documentIdFromPath(pathname: string): string {
  const rest = pathname.startsWith(DOC_PREFIX) ? pathname.slice(DOC_PREFIX.length) : ''
  const decoded = rest.split('/').map(decodeSegment).join('/')

  return decoded === '' || decoded.endsWith('/') ? `${decoded}${FOLDER_INDEX_NAME}` : decoded
}

export function docUrlFor(entryPath: string): string {
  return `${DOC_PREFIX}${entryPath.split('/').map(encodeURIComponent).join('/')}`
}

export interface EntryMove {
  from: string
  to: string
}

export function pathAfterMove({ from, to }: EntryMove, entryPath: string): string {
  if (entryPath === from) return to

  return entryPath.startsWith(`${from}/`) ? `${to}${entryPath.slice(from.length)}` : entryPath
}
