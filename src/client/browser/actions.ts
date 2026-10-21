'use sanity'

import { settleBeforeDeleting } from '../platform/announce/deletion-pending.ts'
import { announceEntryTrashed } from '../platform/announce/entry-trashed.ts'
import { errorMessage } from '../platform/error-message.ts'
import type { Toast } from '../platform/toast.ts'

import type { Dialogs, NameResolver } from '../platform/dialogs.ts'
import { documentNameFor } from './document-name.ts'
import { rebuildingRunner } from './rebuild.ts'
import { FilesRequestError, type FilesClient } from './files-client.ts'
import { archiveUrlFor } from '../../shared/api.ts'
import { archiveFormatNamed } from '../../shared/archive-formats.ts'
import { serially } from '../../shared/serially.ts'
import { SEQUENCE_START } from '../../shared/sequences.ts'
import { joinPath } from '../../shared/store-path.ts'

const ACTION_SELECTORS = {
  newDocument: '#new-document',
  newFolder: '#new-folder',
  upload: '#upload-file',
  uploadInput: '#upload-input',
  archive: '#archive-actions',
  importInput: '#import-input',
  remove: '#delete-entry',
  reveal: '#reveal-document',
  openSelected: '#open-selected',
  insert: '#insert-entry',
} as const

const CORRECTABLE_IN_DIALOG = ['ALREADY_EXISTS', 'INVALID_PATH', 'EMPTY_CONTENT'] as const

type CorrectableInDialog = (typeof CORRECTABLE_IN_DIALOG)[number]

function isCorrectableInDialog(code: string): code is CorrectableInDialog {
  return CORRECTABLE_IN_DIALOG.some((correctable) => correctable === code)
}

export interface ActionContext {
  root: ParentNode
  navigate: (url: string) => void
  client: FilesClient
  dialogs: Dialogs
  toast: Toast
  targetDirectory: () => string
  selectionPath: () => string | null
  refresh: () => Promise<void>
  track: (rebuild: Promise<void>) => void
  reveal: () => void
  openSelected: () => void
  openCreated: (entryPath: string) => void
  insertSelected: () => void
}

interface CreateRequest {
  title: string
  label: string
  nameFor?: NameResolver | undefined
  create: (entryPath: string) => Promise<void>
}

function correctable(error: unknown): string | null {
  return error instanceof FilesRequestError && isCorrectableInDialog(error.code) ? error.message : null
}

async function createVia(create: (entryPath: string) => Promise<void>, entryPath: string): Promise<string | null> {
  try {
    await create(entryPath)
    return null
  } catch (error) {
    const message = correctable(error)
    if (message === null) throw error

    return message
  }
}

function runnerFor(context: ActionContext): (work: () => Promise<void>) => void {
  const rebuilding = rebuildingRunner(context)

  return (work) => {
    rebuilding(async () => {
      await work()

      return undefined
    })
  }
}

async function uploadAll(context: ActionContext, files: readonly File[]): Promise<void> {
  await serially(files, async (file) => {
    await context.client.upload(context.targetDirectory(), file).catch((error: unknown) => {
      context.toast.error(`${file.name}: ${errorMessage(error)}`)
    })
  })
}

const IMPORT_AN_ARCHIVE = 'import'
const ARCHIVE_REQUEST = {
  title: 'Archive',
  message: 'Download this folder, or add the contents of an archive to it.',
  choices: [
    { value: 'zip', label: 'Download .zip' },
    { value: 'tar.gz', label: 'Download .tar.gz' },
    { value: IMPORT_AN_ARCHIVE, label: 'Import an archive' },
  ],
} as const

function refusalDetail(error: unknown): string | null {
  if (!(error instanceof FilesRequestError)) return null

  return error.reasons[SEQUENCE_START] ?? error.paths[SEQUENCE_START] ?? null
}

function importFailure(error: unknown): string {
  const detail = refusalDetail(error)

  return detail === null ? errorMessage(error) : `${errorMessage(error)}: ${detail}`
}

async function importOne(context: ActionContext, archive: File): Promise<void> {
  try {
    const placed = await context.client.importArchive(context.targetDirectory(), archive)
    context.toast.show(`Imported ${String(placed.length)} from ${archive.name}`)
  } catch (error) {
    context.toast.error(importFailure(error))
  }
}

function bindArchive(context: ActionContext, run: (work: () => Promise<void>) => void): void {
  const input = context.root.querySelector<HTMLInputElement>(ACTION_SELECTORS.importInput)

  context.root.querySelector(ACTION_SELECTORS.archive)?.addEventListener('click', () => {
    run(async () => {
      const chosen = await context.dialogs.choose(ARCHIVE_REQUEST)
      const format = chosen === null ? null : archiveFormatNamed(chosen)

      if (format !== null) context.navigate(archiveUrlFor(context.targetDirectory(), format))
      if (chosen === IMPORT_AN_ARCHIVE) input?.click()
    })
  })

  input?.addEventListener('change', () => {
    const [archive] = input.files ?? []
    input.value = ''
    if (archive === undefined) return

    run(async () => {
      await importOne(context, archive)
    })
  })
}

function bindUpload(context: ActionContext, run: (work: () => Promise<void>) => void): void {
  const input = context.root.querySelector<HTMLInputElement>(ACTION_SELECTORS.uploadInput)

  context.root.querySelector(ACTION_SELECTORS.upload)?.addEventListener('click', () => input?.click())

  input?.addEventListener('change', () => {
    const files = [...(input.files ?? [])]
    input.value = ''

    run(async () => {
      await uploadAll(context, files)
    })
  })
}

export function bindActions(context: ActionContext): void {
  const { root, client, dialogs } = context
  const run = runnerFor(context)
  const rebuilding = rebuildingRunner(context)

  function on(selector: string, handler: () => void): void {
    root.querySelector(selector)?.addEventListener('click', handler)
  }

  function promptCreate({ title, label, nameFor, create }: CreateRequest): void {
    const directory = context.targetDirectory()
    let requested = ''

    rebuilding(async () => {
      const created = await dialogs.prompt({
        title,
        label,
        confirmLabel: 'Create',
        nameFor,
        submit: async (name) => {
          requested = joinPath(directory, name)

          return await createVia(create, requested)
        },
      })

      if (!created) return undefined

      return () => {
        context.openCreated(requested)
      }
    })
  }

  on(ACTION_SELECTORS.newDocument, () => {
    promptCreate({
      title: 'New document',
      label: 'Document name',
      nameFor: documentNameFor,
      create: async (entryPath) => {
        await client.createDocument(entryPath)
      },
    })
  })

  on(ACTION_SELECTORS.newFolder, () => {
    promptCreate({
      title: 'New folder',
      label: 'Folder name',
      create: async (folderPath) => {
        await client.createFolder(folderPath)
      },
    })
  })

  on(ACTION_SELECTORS.reveal, context.reveal)
  on(ACTION_SELECTORS.openSelected, context.openSelected)

  on(ACTION_SELECTORS.insert, context.insertSelected)

  on(ACTION_SELECTORS.remove, () => {
    const entryPath = context.selectionPath()
    if (entryPath === null) {
      context.toast.show('Select something to delete first')
      return
    }

    run(async () => {
      const confirmed = await dialogs.confirm({
        title: 'Move to trash',
        message: `${entryPath} can be restored from the trash afterwards.`,
        confirmLabel: 'Delete',
      })
      if (!confirmed) return

      await settleBeforeDeleting(root, entryPath)
      announceEntryTrashed(root, { entryPath, trashId: await client.remove(entryPath) })
    })
  })

  bindUpload(context, run)
  bindArchive(context, run)
}

export function updateInsertAvailability(root: ParentNode, selection: string | null): void {
  const button = root.querySelector<HTMLButtonElement>(ACTION_SELECTORS.insert)
  if (button === null) return

  button.disabled = selection === null
}
