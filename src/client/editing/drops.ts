'use sanity'

import { DRAG_KIND_MIME, DRAG_MIME } from '../platform/drag-payload.ts'

import { directoryOf } from '../../shared/link-paths.ts'
import { entryFor, linkFor, type DroppedEntry } from '../platform/entry-links.ts'
import { uploadInto, type Uploading } from '../browser/uploads.ts'

const ONE_FILE = 1
const NO_LINKS = 0
const BEFORE_THE_EDITOR = true

function draggedEntry(transfer: DataTransfer | null): DroppedEntry | null {
  if (transfer === null) return null

  const path = transfer.getData(DRAG_MIME)
  if (path === '') return null

  const kind = transfer.getData(DRAG_KIND_MIME)

  return { path, kind: kind === 'image' || kind === 'folder' ? kind : 'document' }
}

interface DropOptions {
  holder: () => string | null
  insert: (text: string, at: number | null) => void
}

export function bindEntryDrops(
  content: HTMLElement,
  positionAt: (event: DragEvent) => number | null,
  options: DropOptions,
): void {
  content.addEventListener(
    'dragover',
    (event) => {
      if (event.dataTransfer?.types.includes(DRAG_MIME) !== true) return

      event.preventDefault()
    },
    BEFORE_THE_EDITOR,
  )

  content.addEventListener(
    'drop',
    (event) => {
      const entry = draggedEntry(event.dataTransfer)
      if (entry === null) return

      event.preventDefault()
      const holder = options.holder()
      if (holder === null) return

      options.insert(linkFor(entry, holder), positionAt(event))
    },
    BEFORE_THE_EDITOR,
  )
}

export const TestOnly = { draggedEntry, insertionFor, receive }

function droppedFiles(transfer: DataTransfer | null): File[] | null {
  if (transfer === null || ![...transfer.types].includes('Files')) return null

  return [...transfer.files]
}

interface FileDropOptions extends Uploading {
  holder: () => string | null
  insert: (text: string, at: number | null) => void
}

function insertionFor(links: readonly string[], atLineStart: boolean): string {
  const body = links.join('\n')
  if (links.length === ONE_FILE) return body

  return atLineStart ? body : `\n${body}`
}

async function receive(
  files: readonly File[],
  at: number | null,
  atLineStart: (position: number | null) => boolean,
  options: FileDropOptions,
): Promise<void> {
  const holder = options.holder()
  if (holder === null) return

  const stored = await uploadInto(files, directoryOf(holder), options)
  const links = stored.map((entryPath) => linkFor(entryFor(entryPath), holder))

  if (links.length > NO_LINKS) options.insert(insertionFor(links, atLineStart(at)), at)
}

export function bindFileDrops(
  content: HTMLElement,
  positionAt: (event: DragEvent) => number | null,
  atLineStart: (position: number | null) => boolean,
  options: FileDropOptions,
): void {
  content.addEventListener(
    'dragover',
    (event) => {
      if (droppedFiles(event.dataTransfer) === null) return

      event.preventDefault()
    },
    BEFORE_THE_EDITOR,
  )

  content.addEventListener(
    'drop',
    (event) => {
      const files = droppedFiles(event.dataTransfer)
      if (files === null) return

      event.preventDefault()
      void receive(files, positionAt(event), atLineStart, options)
    },
    BEFORE_THE_EDITOR,
  )
}
