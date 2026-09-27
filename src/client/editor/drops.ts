'use sanity'

import { encodeDestination } from '../../shared/link-syntax.ts'
import { directoryOf, relativeDestination } from '../../shared/link-paths.ts'
import { PAST_SEPARATOR, SEQUENCE_START } from '../../shared/sequences.ts'
import { classifyFile, type EntryKind } from '../../shared/documents.ts'
import { joinPath } from '../../shared/store-path.ts'
import { serially } from '../../shared/serially.ts'
import { errorMessage } from '../error-message.ts'
import { FilesRequestError, type FilesClient } from '../files/files-client.ts'
import type { Dialogs } from '../files/dialogs.ts'
import type { Toast } from '../layout/toast.ts'

const DRAG_MIME = 'application/x-vixen-path'
const DRAG_KIND_MIME = 'application/x-vixen-kind'
const NOT_BRACKETED = false
const ONE_FILE = 1
const ALREADY_EXISTS = 'ALREADY_EXISTS'
const SUGGESTED_SUFFIX = '-1'
const NO_LINKS = 0
const BEFORE_THE_EDITOR = true

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
  content.addEventListener(
    'dragover',
    (event) => {
      if (draggedEntry(event.dataTransfer) === null) return

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
      options.insert(linkFor(entry, options.holder()), positionAt(event))
    },
    BEFORE_THE_EDITOR,
  )
}

export const TestOnly = { draggedEntry, insertionFor, linkFor, suggestedName }

function droppedFiles(transfer: DataTransfer | null): File[] | null {
  if (transfer === null || ![...transfer.types].includes('Files')) return null

  return [...transfer.files]
}

function entryFor(storedPath: string): DroppedEntry {
  return { path: storedPath, kind: classifyFile(storedPath) === 'image' ? 'image' : 'document' }
}

function suggestedName(filename: string): string {
  const dot = filename.lastIndexOf('.')

  return dot <= SEQUENCE_START
    ? `${filename}${SUGGESTED_SUFFIX}`
    : `${filename.slice(SEQUENCE_START, dot)}${SUGGESTED_SUFFIX}${filename.slice(dot)}`
}

function collided(error: unknown): boolean {
  return error instanceof FilesRequestError && error.code === ALREADY_EXISTS
}

interface FileDropOptions {
  holder: () => string
  client: FilesClient
  dialogs: Dialogs
  toast: Toast
  insert: (text: string, at: number | null) => void
}

async function storeOne(file: File, directory: string, options: FileDropOptions): Promise<string | null> {
  try {
    return await options.client.upload(directory, file)
  } catch (error) {
    if (!collided(error)) {
      options.toast.error(`${file.name}: ${errorMessage(error)}`)

      return null
    }
  }

  return await resolveCollision(file, directory, options)
}

async function resolveCollision(file: File, directory: string, options: FileDropOptions): Promise<string | null> {
  let stored: string | null = joinPath(directory, file.name)

  const renamed = await options.dialogs.prompt({
    title: `${file.name} is already there`,
    label: 'New name',
    value: suggestedName(file.name),
    confirmLabel: 'Upload under this name',
    submit: async (name: string) => {
      try {
        stored = await options.client.upload(directory, file, name)

        return null
      } catch (error) {
        return errorMessage(error)
      }
    },
  })

  return renamed ? stored : joinPath(directory, file.name)
}

function insertionFor(links: readonly string[], atLineStart: boolean): string {
  const body = links.join('\n')
  if (links.length === ONE_FILE) return body

  return atLineStart ? body : `\n${body}`
}

export function bindFileDrops(
  content: HTMLElement,
  positionAt: (event: DragEvent) => number | null,
  atLineStart: (position: number | null) => boolean,
  options: FileDropOptions,
): void {
  async function receive(files: readonly File[], at: number | null): Promise<void> {
    const directory = directoryOf(options.holder())
    const links: string[] = []

    await serially(files, async (file) => {
      const stored = await storeOne(file, directory, options)
      if (stored !== null) links.push(linkFor(entryFor(stored), options.holder()))
    })

    if (links.length > NO_LINKS) options.insert(insertionFor(links, atLineStart(at)), at)
  }

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
      void receive(files, positionAt(event))
    },
    BEFORE_THE_EDITOR,
  )
}
