'use sanity'

import { SEQUENCE_START } from '../shared/sequences.ts'
import { FOLDER_INDEX_NAME } from '../shared/documents.ts'
import { DOC_PREFIX } from '../shared/doc-url.ts'

const TITLE_SEGMENTS = 2
const LAST_SEGMENT = -1

function decodeSegment(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

function decodedPath(pathname: string): string {
  const rest = pathname.startsWith(DOC_PREFIX) ? pathname.slice(DOC_PREFIX.length) : ''

  return rest.split('/').map(decodeSegment).join('/')
}

export function namesFolderIndex(pathname: string): boolean {
  const decoded = decodedPath(pathname)

  return decoded === '' || decoded.endsWith('/')
}

export function documentIdFromPath(pathname: string): string {
  const decoded = decodedPath(pathname)

  return namesFolderIndex(pathname) ? `${decoded}${FOLDER_INDEX_NAME}` : decoded
}

export function displayPathFromPath(pathname: string): string {
  const decoded = decodedPath(pathname)

  return decoded.endsWith('/') ? decoded.slice(SEQUENCE_START, LAST_SEGMENT) : decoded
}

export function titleFor(displayPath: string): string {
  return displayPath.split('/').slice(-TITLE_SEGMENTS).join('/')
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
