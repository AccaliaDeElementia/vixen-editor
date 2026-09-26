'use sanity'

export const FOLDER_INDEX_NAME = 'index.md'

const FILE_KINDS = ['document', 'image'] as const
const ENTRY_KINDS = [...FILE_KINDS, 'folder'] as const

export type FileKind = (typeof FILE_KINDS)[number]
export type EntryKind = (typeof ENTRY_KINDS)[number]

export function isEntryKind(value: unknown): value is EntryKind {
  return ENTRY_KINDS.some((kind) => kind === value)
}

export const DOCUMENT_EXTENSIONS: readonly string[] = ['.md', '.txt']
export const IMAGE_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
export const UPLOAD_EXTENSIONS: readonly string[] = [...DOCUMENT_EXTENSIONS, ...IMAGE_EXTENSIONS]

const PAST_SEPARATOR = 1
const NO_EXTENSION = ''
const LEADING_DOT = 0

export function extensionOf(value: string): string {
  const name = value.slice(value.lastIndexOf('/') + PAST_SEPARATOR)
  const dot = name.lastIndexOf('.')

  return dot <= LEADING_DOT ? NO_EXTENSION : name.slice(dot).toLowerCase()
}

export function classifyFile(name: string): FileKind | null {
  const extension = extensionOf(name)
  if (DOCUMENT_EXTENSIONS.includes(extension)) return 'document'
  if (IMAGE_EXTENSIONS.includes(extension)) return 'image'

  return null
}
