'use sanity'

import type { Toast } from '../layout/toast.ts'

import type { Dialogs } from './dialogs.ts'
import { archiveUrlFor, FilesRequestError, type FilesClient } from './files-client.ts'

export const ACTION_SELECTORS = {
  newDocument: '#new-document',
  newFolder: '#new-folder',
  upload: '#upload-file',
  uploadInput: '#upload-input',
  download: '#download-archive',
  remove: '#delete-entry',
  reveal: '#reveal-document',
} as const

// Codes the user can act on by editing what they typed. Anything else is a
// failure they cannot fix from inside the dialog, so it goes to the toast.
const CORRECTABLE = new Set(['ALREADY_EXISTS', 'INVALID_PATH', 'EMPTY_CONTENT'])

export interface ActionContext {
  root: ParentNode
  client: FilesClient
  dialogs: Dialogs
  toast: Toast
  targetDirectory: () => string
  selectionPath: () => string | null
  refresh: () => Promise<void>
  reveal: () => void
}

export function joinPath(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

function correctable(error: unknown): string | null {
  return error instanceof FilesRequestError && CORRECTABLE.has(error.code) ? error.message : null
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
  return (work) => {
    void (async () => {
      try {
        await work()
        await context.refresh()
      } catch (error) {
        context.toast.error(describe(error))
      }
    })()
  }
}

function bindUpload(context: ActionContext, run: (work: () => Promise<void>) => void): void {
  const input = context.root.querySelector<HTMLInputElement>(ACTION_SELECTORS.uploadInput)

  context.root.querySelector(ACTION_SELECTORS.upload)?.addEventListener('click', () => input?.click())

  input?.addEventListener('change', () => {
    const files = [...(input.files ?? [])]
    input.value = ''

    run(async () => {
      for (const file of files) {
        /* eslint-disable-next-line no-await-in-loop -- one request per file, so
           a rejected file does not discard the rest; the server's write lock
           serialises them regardless of what the client does */
        await context.client.upload(context.targetDirectory(), file).catch((error: unknown) => {
          context.toast.error(`${file.name}: ${describe(error)}`)
        })
      }
    })
  })
}

export function bindActions(context: ActionContext): void {
  const { root, client, dialogs } = context
  const run = runnerFor(context)

  function on(selector: string, handler: () => void): void {
    root.querySelector(selector)?.addEventListener('click', handler)
  }

  function promptCreate(title: string, label: string, create: (entryPath: string) => Promise<void>): void {
    const directory = context.targetDirectory()

    run(async () => {
      await dialogs.prompt({
        title,
        label,
        confirmLabel: 'Create',
        submit: async (name) => await createVia(create, joinPath(directory, name)),
      })
    })
  }

  on(ACTION_SELECTORS.newDocument, () => {
    promptCreate('New document', 'Document name', async (entryPath) => {
      await client.createDocument(entryPath)
    })
  })

  on(ACTION_SELECTORS.newFolder, () => {
    promptCreate('New folder', 'Folder name', async (folderPath) => {
      await client.createFolder(folderPath)
    })
  })

  on(ACTION_SELECTORS.reveal, context.reveal)

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
      if (confirmed) await client.remove(entryPath)
    })
  })

  bindUpload(context, run)
}

export function updateArchiveLink(root: ParentNode, directory: string): void {
  root.querySelector<HTMLAnchorElement>(ACTION_SELECTORS.download)?.setAttribute('href', archiveUrlFor(directory))
}

export interface TrashAction {
  action: string
  trashId: string
}

// The trash action an event came from, or null when it came from anywhere else
// — including a target that is no element at all.
export function trashActionOf(target: EventTarget | null): TrashAction | null {
  const button = target instanceof Element ? target.closest<HTMLElement>('[data-action]') : null
  const trashId = button?.dataset.trashId
  const action = button?.dataset.action
  if (trashId === undefined || action === undefined) return null

  return { action, trashId }
}

export function bindTrashActions(context: ActionContext, tree: Element): void {
  const run = runnerFor(context)

  tree.addEventListener('click', (event) => {
    const pressed = trashActionOf(event.target)
    if (pressed === null) return

    const { action, trashId } = pressed
    event.preventDefault()
    event.stopPropagation()

    run(async () => {
      if (action === 'restore') {
        await context.client.restore(trashId)
        return
      }

      const confirmed = await context.dialogs.confirm({
        title: 'Delete for good',
        message: 'This cannot be undone.',
        confirmLabel: 'Delete for good',
      })
      if (confirmed) await context.client.purge(trashId)
    })
  })
}
