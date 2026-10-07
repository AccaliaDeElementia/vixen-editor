'use sanity'

import { DRAG_KIND_MIME, DRAG_MIME } from '../drag-payload.ts'

import { encodeDestination } from '../../shared/link-syntax.ts'
import { basenameOf, directoryOf, relativeDestination } from '../../shared/link-paths.ts'
import { SEQUENCE_START } from '../../shared/sequences.ts'
import { classifyFile, type EntryKind } from '../../shared/documents.ts'
import { joinPath } from '../../shared/store-path.ts'
import { serially } from '../../shared/serially.ts'
import { errorMessage } from '../error-message.ts'
import { FilesRequestError, type FilesClient } from '../files/files-client.ts'
import type { Dialogs } from '../files/dialogs.ts'
import type { Toast } from '../toast.ts'

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

function destinationFor(entry: DroppedEntry, holder: string): string {
  const relative = relativeDestination(directoryOf(holder), entry.path)

  return entry.kind === 'folder' ? `${relative}/` : relative
}

function linkFor(entry: DroppedEntry, holder: string): string {
  const destination = encodeDestination(destinationFor(entry, holder), NOT_BRACKETED)
  const label = basenameOf(entry.path)

  return entry.kind === 'image' ? `![${label}](${destination})` : `[${label}](${destination})`
}

export function linkTo(entryPath: string, holder: string): string {
  return linkFor({ path: entryPath, kind: classifyFile(entryPath) ?? 'folder' }, holder)
}

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

export const TestOnly = { draggedEntry, insertionFor, linkFor, receive, suggestedName }

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

interface Uploading {
  client: FilesClient
  dialogs: Dialogs
  toast: Toast
  announce: () => void
}

interface FileDropOptions extends Uploading {
  holder: () => string | null
  insert: (text: string, at: number | null) => void
}

async function storeOne(file: File, directory: string, options: Uploading): Promise<string | null> {
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

async function resolveCollision(file: File, directory: string, options: Uploading): Promise<string | null> {
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

export async function uploadInto(files: readonly File[], directory: string, options: Uploading): Promise<string[]> {
  const stored: string[] = []

  await serially(files, async (file) => {
    const landed = await storeOne(file, directory, options)
    if (landed !== null) stored.push(landed)
  })

  if (stored.length > NO_LINKS) options.announce()

  return stored
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
