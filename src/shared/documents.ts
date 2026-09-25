'use sanity'

export const FOLDER_INDEX_NAME = 'index.md'

const FILE_KINDS = ['document', 'image'] as const
const ENTRY_KINDS = [...FILE_KINDS, 'folder'] as const

export type FileKind = (typeof FILE_KINDS)[number]
export type EntryKind = (typeof ENTRY_KINDS)[number]

export function isEntryKind(value: unknown): value is EntryKind {
  return ENTRY_KINDS.some((kind) => kind === value)
}
