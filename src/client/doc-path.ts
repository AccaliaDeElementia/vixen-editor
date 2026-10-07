'use sanity'

import { SEQUENCE_START } from '../shared/sequences.ts'
import { FOLDER_INDEX_ALTERNATE, FOLDER_INDEX_NAME } from '../shared/documents.ts'
import { DOC_PREFIX } from '../shared/page-urls.ts'

export const TAB_VIEWS = ['editor', 'source', 'markup', 'image', 'missing', 'deleted', 'unreachable'] as const

export type TabView = (typeof TAB_VIEWS)[number]
export type PreviewView = 'source' | 'markup'

const DEFAULT_VIEW: TabView = 'editor'
const VIEW_PARAMETER = 'view'
const VIEW_IN_URL: Readonly<Partial<Record<TabView, string>>> = { editor: 'edit', source: 'source', markup: 'preview' }
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

function namesFolderIndex(pathname: string): boolean {
  const decoded = decodedPath(pathname)

  return decoded === '' || decoded.endsWith('/')
}

export function documentIdFromPath(pathname: string): string {
  const decoded = decodedPath(pathname)

  return namesFolderIndex(pathname) ? `${decoded}${FOLDER_INDEX_NAME}` : decoded
}

export function folderIndexAlternateFromPath(pathname: string): string | null {
  if (!namesFolderIndex(pathname)) return null

  return `${decodedPath(pathname)}${FOLDER_INDEX_ALTERNATE}`
}

export function displayPathFromPath(pathname: string): string {
  const decoded = decodedPath(pathname)

  return decoded.endsWith('/') ? decoded.slice(SEQUENCE_START, LAST_SEGMENT) : decoded
}

export function titleFor(displayPath: string): string {
  return displayPath.split('/').slice(-TITLE_SEGMENTS).join('/')
}

export function docUrlFor(entryPath: string, view: TabView = DEFAULT_VIEW): string {
  const at = `${DOC_PREFIX}${entryPath.split('/').map(encodeURIComponent).join('/')}`
  const { [view]: spelling } = VIEW_IN_URL
  if (spelling === undefined || view === DEFAULT_VIEW) return at

  return `${at}?${VIEW_PARAMETER}=${spelling}`
}

export function isPreviewView(view: TabView): view is PreviewView {
  return view === 'source' || view === 'markup'
}

export function viewFromSearch(search: string): TabView {
  const named = new URLSearchParams(search).get(VIEW_PARAMETER)

  return TAB_VIEWS.find((candidate) => VIEW_IN_URL[candidate] === named) ?? DEFAULT_VIEW
}

export interface EntryMove {
  from: string
  to: string
}

export function pathAfterMove({ from, to }: EntryMove, entryPath: string): string {
  if (entryPath === from) return to

  return entryPath.startsWith(`${from}/`) ? `${to}${entryPath.slice(from.length)}` : entryPath
}

export const TestOnly = { namesFolderIndex }
