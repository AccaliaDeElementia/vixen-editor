'use sanity'

import { encodeDestination } from '../../shared/link-syntax.ts'
import { directoryOf, relativeDestination } from '../../shared/link-paths.ts'
import { PAST_SEPARATOR } from '../../shared/sequences.ts'
import type { EntryKind } from '../../shared/documents.ts'

const DRAG_MIME = 'application/x-vixen-path'
const DRAG_KIND_MIME = 'application/x-vixen-kind'
const NOT_BRACKETED = false

interface DroppedEntry {
  path: string
  kind: EntryKind
}

function basenameOf(entryPath: string): string {
  return entryPath.slice(entryPath.lastIndexOf('/') + PAST_SEPARATOR)
}

function destinationFor(entry: DroppedEntry, holder: string): string {
  const relative = relativeDestination(directoryOf(holder), entry.path)

  return entry.kind === 'folder' ? `${relative}/` : relative
}

function linkFor(entry: DroppedEntry, holder: string): string {
  const destination = encodeDestination(destinationFor(entry, holder), NOT_BRACKETED)
  const label = basenameOf(entry.path)

  return entry.kind === 'image' ? `![${label}](${destination})` : `[${label}](${destination})`
}

function draggedEntry(transfer: DataTransfer | null): DroppedEntry | null {
  if (transfer === null) return null

  const path = transfer.getData(DRAG_MIME)
  if (path === '') return null

  const kind = transfer.getData(DRAG_KIND_MIME)

  return { path, kind: kind === 'image' || kind === 'folder' ? kind : 'document' }
}

interface DropOptions {
  holder: () => string
  insert: (text: string, at: number | null) => void
}

export function bindEntryDrops(
  content: HTMLElement,
  positionAt: (event: DragEvent) => number | null,
  options: DropOptions,
): void {
  content.addEventListener('dragover', (event) => {
    if (draggedEntry(event.dataTransfer) === null) return

    event.preventDefault()
  })

  content.addEventListener('drop', (event) => {
    const entry = draggedEntry(event.dataTransfer)
    if (entry === null) return

    event.preventDefault()
    options.insert(linkFor(entry, options.holder()), positionAt(event))
  })
}

export const TestOnly = { draggedEntry, linkFor }
