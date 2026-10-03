'use sanity'

import { docUrlFor } from '../doc-path.ts'
import { errorMessage } from '../error-message.ts'
import type { FilesClient } from '../files/files-client.ts'
import { entryPathsIn, type TrashNode } from '../files/tree-model.ts'
import { announceStoreChanged } from '../store-changed.ts'
import type { Toast } from '../toast.ts'

const WHAT_SELECTOR = '#deleted-what'
const ACTIONS_SELECTOR = '#deleted-actions'
const RESTORE_SELECTOR = '#deleted-restore'
const BLOCKED_SELECTOR = '#deleted-blocked'

export interface DeletedView {
  offer: (entryId: string) => void
}

interface DeletedViewOptions {
  root: ParentNode
  client: FilesClient
  toast: Toast
  reveal: (at: string) => void
  openUrl: (url: string) => void
}

interface Parts {
  what: HTMLElement
  actions: HTMLElement
  restore: HTMLButtonElement
  blocked: HTMLElement
}

function partsOf(root: ParentNode): Parts | null {
  const what = root.querySelector<HTMLElement>(WHAT_SELECTOR)
  const actions = root.querySelector<HTMLElement>(ACTIONS_SELECTOR)
  const restore = root.querySelector<HTMLButtonElement>(RESTORE_SELECTOR)
  const blocked = root.querySelector<HTMLElement>(BLOCKED_SELECTOR)

  if (what === null || actions === null || restore === null || blocked === null) return null

  return { what, actions, restore, blocked }
}

function describe(entry: TrashNode): string {
  const when = new Date(entry.deletedAt).toLocaleString()
  const subject = entry.kind === 'folder' ? 'The folder' : 'The file'

  return `${subject} ${entry.originalPath} was deleted ${when}.`
}

const INERT: DeletedView = {
  offer: () => undefined,
}

export function createDeletedView(options: DeletedViewOptions): DeletedView {
  const parts = partsOf(options.root)
  if (parts === null) return INERT

  const { what, actions, restore, blocked } = parts
  let entry: TrashNode | null = null

  async function restoreEntry(target: TrashNode): Promise<void> {
    try {
      await options.client.restore(target.id)
      announceStoreChanged(options.root)
      options.openUrl(docUrlFor(target.originalPath))
    } catch (error) {
      options.toast.error(`Restore failed: ${errorMessage(error)}`)
    }
  }

  function showGone(entryId: string): void {
    entry = null
    what.textContent = `Nothing in the trash has the id ${entryId}. It may already have been restored or purged.`
    actions.hidden = true
    blocked.hidden = true
    options.reveal('')
  }

  function showEntry(found: TrashNode, occupied: boolean): void {
    entry = found
    what.textContent = describe(found)
    actions.hidden = occupied
    blocked.hidden = !occupied
    blocked.textContent = occupied ? `${found.originalPath} is in use again, so this cannot be restored.` : ''
    options.reveal(found.originalPath)
  }

  async function load(entryId: string): Promise<void> {
    const [trash, tree] = await Promise.all([options.client.trash(), options.client.tree()])
    const found = trash.find((candidate) => candidate.id === entryId)

    if (found === undefined) {
      showGone(entryId)
      return
    }

    showEntry(found, new Set(entryPathsIn(tree)).has(found.originalPath))
  }

  restore.addEventListener('click', () => {
    if (entry !== null) void restoreEntry(entry)
  })

  return {
    offer(entryId: string): void {
      entry = null
      what.textContent = ''
      actions.hidden = true
      blocked.hidden = true

      void load(entryId).catch((error: unknown) => {
        options.toast.error(`Could not read the trash: ${errorMessage(error)}`)
      })
    },
  }
}
