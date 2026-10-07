'use sanity'

import { docUrlFor } from '../doc-path.ts'
import { deepestSharedFolder, joinPath, STORE_ROOT } from '../../shared/store-path.ts'
import { errorMessage } from '../error-message.ts'
import type { Dialogs } from '../files/dialogs.ts'
import type { FilesClient, RestoreOutcome } from '../files/files-client.ts'
import { entryPathsIn, type TrashNode } from '../files/tree-model.ts'
import { renderRestoreTree, type RestoreTree } from './restore-tree.ts'
import { TRASH_PATH } from '../files/tree-view.ts'
import { requestReveal } from '../reveal-request.ts'
import { announceStoreChanged } from '../store-changed.ts'
import type { Toast } from '../toast.ts'

const WHAT_SELECTOR = '[data-part="deleted-what"]'
const ACTIONS_SELECTOR = '[data-part="deleted-actions"]'
const RESTORE_SELECTOR = '[data-part="deleted-restore"]'
const PURGE_SELECTOR = '[data-part="deleted-purge"]'
const BLOCKED_SELECTOR = '[data-part="deleted-blocked"]'
const CONTENTS_SELECTOR = '[data-part="deleted-contents"]'

type Refusal = string

const NOTHING_CHOSEN = 0
const NOTHING_MORE = 0

export interface DeletedView {
  offer: (entryId: string) => Promise<void>
}

interface DeletedViewOptions {
  root: ParentNode
  host: ParentNode
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

const NOTHING_TO_OFFER = Promise.resolve()

const INERT: DeletedView = {
  offer: async () => {
    await NOTHING_TO_OFFER
  },
}

export function createDeletedView(options: DeletedViewOptions): DeletedView {
  const parts = partsOf(options.host)
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

  async function settle(target: TrashNode, outcome: RestoreOutcome): Promise<void> {
    announceStoreChanged(options.root)

    if (outcome.entryRemains) {
      await load(target.id)
      return
    }

    const landed = landingFor(outcome.restored)
    requestReveal(options.root, landed)
    options.openUrl(docUrlFor(landed))
  }

  async function restoreEntry(target: TrashNode): Promise<void> {
    try {
      await settle(target, await options.client.restore(target.id, chosenRoots()))
    } catch (error) {
      options.toast.error(`Restore failed: ${errorMessage(error)}`)
    }
  }

  function wasAt(target: TrashNode, within: string): string {
    return within === STORE_ROOT ? target.originalPath : joinPath(target.originalPath, within)
  }

  async function restoredOrRefusal(target: TrashNode, within: string, to: string): Promise<RestoreOutcome | Refusal> {
    try {
      return await options.client.restore(target.id, [within], to)
    } catch (error) {
      return errorMessage(error)
    }
  }

  async function placeAt(target: TrashNode, within: string, to: string): Promise<Refusal | null> {
    const placed = await restoredOrRefusal(target, within, to)
    if (typeof placed === 'string') return placed

    await settle(target, placed)

    return null
  }

  async function placeElsewhere(target: TrashNode, within: string): Promise<void> {
    await options.dialogs.prompt({
      title: 'Put back somewhere else',
      label: 'Path',
      confirmLabel: 'Put back',
      value: wasAt(target, within),
      submit: async (to: string): Promise<Refusal | null> => await placeAt(target, within, to),
    })
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
    contents.replaceChildren()
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

  async function showContents(found: TrashNode): Promise<void> {
    const held = await options.client.trashEntry(found.id)
    contents.hidden = held === null
    chosenIn =
      held === null
        ? null
        : renderRestoreTree(contents, held, {
            onChanged: offerRestore,
            onRename: (within: string) => {
              void placeElsewhere(found, within)
            },
          })
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
    await showContents(found)
  }

  restore.addEventListener('click', () => {
    if (entry !== null) void restoreEntry(entry)
  })

  purge.addEventListener('click', () => {
    if (entry !== null) void purgeEntry(entry)
  })

  return {
    async offer(entryId: string): Promise<void> {
      forgetEntry()
      what.textContent = ''
      actions.hidden = true
      blocked.hidden = true

      await load(entryId).catch((error: unknown) => {
        options.toast.error(`Could not read the trash: ${errorMessage(error)}`)
      })
    },
  }
}
