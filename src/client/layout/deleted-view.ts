'use sanity'

import { docUrlFor } from '../doc-path.ts'
import { deepestSharedFolder, joinPath, STORE_ROOT } from '../../shared/store-path.ts'
import { errorMessage } from '../error-message.ts'
import type { Dialogs } from '../files/dialogs.ts'
import type { FilesClient } from '../files/files-client.ts'
import { entryPathsIn, type TrashNode } from '../files/tree-model.ts'
import { renderRestoreTree, type RestoreTree } from './restore-tree.ts'
import { TRASH_PATH } from '../files/tree-view.ts'
import { requestReveal } from '../reveal-request.ts'
import { announceStoreChanged } from '../store-changed.ts'
import type { Toast } from '../toast.ts'

const WHAT_SELECTOR = '#deleted-what'
const ACTIONS_SELECTOR = '#deleted-actions'
const RESTORE_SELECTOR = '#deleted-restore'
const PURGE_SELECTOR = '#deleted-purge'
const BLOCKED_SELECTOR = '#deleted-blocked'
const CONTENTS_SELECTOR = '#deleted-contents'

const NOTHING_CHOSEN = 0
const NOTHING_MORE = 0

export interface DeletedView {
  offer: (entryId: string) => void
}

interface DeletedViewOptions {
  root: ParentNode
  client: FilesClient
  dialogs: Dialogs
  toast: Toast
  reveal: (at: string) => void
  openUrl: (url: string) => void
}

interface Parts {
  contents: HTMLElement
  what: HTMLElement
  actions: HTMLElement
  restore: HTMLButtonElement
  purge: HTMLButtonElement
  blocked: HTMLElement
}

function partsOf(root: ParentNode): Parts | null {
  const what = root.querySelector<HTMLElement>(WHAT_SELECTOR)
  const actions = root.querySelector<HTMLElement>(ACTIONS_SELECTOR)
  const restore = root.querySelector<HTMLButtonElement>(RESTORE_SELECTOR)
  const purge = root.querySelector<HTMLButtonElement>(PURGE_SELECTOR)
  const blocked = root.querySelector<HTMLElement>(BLOCKED_SELECTOR)
  const contents = root.querySelector<HTMLElement>(CONTENTS_SELECTOR)

  if (what === null || actions === null || restore === null || purge === null) return null
  if (blocked === null || contents === null) return null

  return { contents, what, actions, restore, purge, blocked }
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

  const { contents, what, actions, restore, purge, blocked } = parts
  let entry: TrashNode | null = null
  let chosenIn: RestoreTree | null = null
  let placeTaken = false

  function chosenRoots(): readonly string[] {
    if (chosenIn !== null) return chosenIn.roots()

    return placeTaken ? [] : [STORE_ROOT]
  }

  function offerRestore(): void {
    restore.disabled = chosenRoots().length === NOTHING_CHOSEN
  }

  function landingFor(restored: readonly string[]): string {
    const [only, ...rest] = restored
    if (only === undefined) return STORE_ROOT
    if (rest.length === NOTHING_MORE) return only

    const holder = deepestSharedFolder(restored)

    return holder === STORE_ROOT ? STORE_ROOT : `${holder}/`
  }

  async function restoreEntry(target: TrashNode): Promise<void> {
    try {
      const outcome = await options.client.restore(target.id, chosenRoots())
      announceStoreChanged(options.root)

      if (outcome.entryRemains) {
        await load(target.id)
        return
      }

      const landed = landingFor(outcome.restored)
      requestReveal(options.root, landed)
      options.openUrl(docUrlFor(landed))
    } catch (error) {
      options.toast.error(`Restore failed: ${errorMessage(error)}`)
    }
  }

  async function purgeEntry(target: TrashNode): Promise<void> {
    const confirmed = await options.dialogs.confirm({
      title: 'Delete for good',
      message: `${target.originalPath} cannot be brought back after this.`,
      confirmLabel: 'Delete for good',
    })
    if (!confirmed) return

    try {
      await options.client.purge(target.id)
      announceStoreChanged(options.root)
      showPurged(target.originalPath)
    } catch (error) {
      options.toast.error(`Delete failed: ${errorMessage(error)}`)
    }
  }

  function showPurged(originalPath: string): void {
    forgetEntry()
    what.textContent = `${originalPath} was deleted for good.`
    actions.hidden = true
    blocked.hidden = true
    options.reveal('')
  }

  function showGone(entryId: string): void {
    forgetEntry()
    what.textContent = `Nothing in the trash has the id ${entryId}. It may already have been restored or purged.`
    actions.hidden = true
    blocked.hidden = true
    options.reveal('')
  }

  function forgetEntry(): void {
    entry = null
    chosenIn = null
    placeTaken = false
    contents.hidden = true
  }

  function showEntry(found: TrashNode, occupied: boolean): void {
    entry = found
    placeTaken = occupied
    what.textContent = describe(found)
    actions.hidden = false
    offerRestore()
    blocked.hidden = !occupied
    blocked.textContent = occupied ? `${found.originalPath} is in use again, so this cannot be restored.` : ''
    requestReveal(options.root, joinPath(TRASH_PATH, found.id))
    options.reveal(found.originalPath)
  }

  async function showContents(entryId: string): Promise<void> {
    const held = await options.client.trashEntry(entryId)
    contents.hidden = held === null
    chosenIn = held === null ? null : renderRestoreTree(contents, held, offerRestore)
    offerRestore()
  }

  async function load(entryId: string): Promise<void> {
    const [trash, tree] = await Promise.all([options.client.trash(), options.client.tree()])
    const found = trash.find((candidate) => candidate.id === entryId)

    if (found === undefined) {
      showGone(entryId)
      return
    }

    showEntry(found, new Set(entryPathsIn(tree)).has(found.originalPath))
    await showContents(entryId)
  }

  restore.addEventListener('click', () => {
    if (entry !== null) void restoreEntry(entry)
  })

  purge.addEventListener('click', () => {
    if (entry !== null) void purgeEntry(entry)
  })

  return {
    offer(entryId: string): void {
      forgetEntry()
      what.textContent = ''
      actions.hidden = true
      blocked.hidden = true

      void load(entryId).catch((error: unknown) => {
        options.toast.error(`Could not read the trash: ${errorMessage(error)}`)
      })
    },
  }
}
