'use sanity'

import { encodeDestination } from '../../shared/link-syntax.ts'
import { basenameOf, directoryOf, relativeDestination } from '../../shared/link-paths.ts'
import { classifyFile, type EntryKind } from '../../shared/documents.ts'

const NOT_BRACKETED = false

export interface DroppedEntry {
  path: string
  kind: EntryKind
}

function destinationFor(entry: DroppedEntry, holder: string): string {
  const relative = relativeDestination(directoryOf(holder), entry.path)

  return entry.kind === 'folder' ? `${relative}/` : relative
}

export function linkFor(entry: DroppedEntry, holder: string): string {
  const destination = encodeDestination(destinationFor(entry, holder), NOT_BRACKETED)
  const label = basenameOf(entry.path)

  return entry.kind === 'image' ? `![${label}](${destination})` : `[${label}](${destination})`
}

export function linkTo(entryPath: string, holder: string): string {
  return linkFor({ path: entryPath, kind: classifyFile(entryPath) ?? 'folder' }, holder)
}

export function entryFor(storedPath: string): DroppedEntry {
  return { path: storedPath, kind: classifyFile(storedPath) === 'image' ? 'image' : 'document' }
}
