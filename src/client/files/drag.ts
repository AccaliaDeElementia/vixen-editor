'use sanity'

import type { DocumentMoved } from '../document-moved.ts'
import type { Toast } from '../layout/toast.ts'

import type { Dialogs } from './dialogs.ts'
import type { FilesClient } from './files-client.ts'
import { isStoreRow, rowIndexOf, ROW_SELECTOR, type VisibleRow } from './tree-view.ts'

const DRAG_MIME = 'application/x-vixen-path'
const DROP_TARGET_CLASS = 'tree__row--drop'

interface DragContext {
  client: FilesClient
  dialogs: Dialogs
  toast: Toast
  rowAt: (index: number) => VisibleRow | undefined
  refresh: () => Promise<void>
  revealPath: (entryPath: string) => void
  announce: (moved: DocumentMoved) => void
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'unknown error'
}

function basenameOf(entryPath: string): string {
  return entryPath.slice(entryPath.lastIndexOf('/') + 1)
}

function parentOf(entryPath: string): string {
  const cut = entryPath.lastIndexOf('/')

  return cut === -1 ? '' : entryPath.slice(0, cut)
}

function joinInto(directory: string, name: string): string {
  return directory === '' ? name : `${directory}/${name}`
}

// The directory a drop on this row would land in. The trash and its entries
// are rows but not places in the store, so they take no drops at all.
function containerOf(row: VisibleRow | undefined): string | null {
  if (row === undefined) return ''
  if (!isStoreRow(row)) return null

  return row.kind === 'folder' ? row.path : parentOf(row.path)
}

// Moving a folder into itself or into its own descendant is not a move, so the
// drop affordance never appears; the server's INVALID_MOVE is the backstop.
function canMoveInto(source: string, directory: string): boolean {
  return directory !== source && !directory.startsWith(`${source}/`)
}

export function bindDragAndDrop(context: DragContext, tree: HTMLElement): void {
  // Held here because `getData` is unreadable during dragover in a real
  // browser, and the affordance has to know what is being dragged to decide
  // whether a drop is legal at all.
  let dragging: string | null = null

  // null is the tree background: a legal drop target with no row to mark.
  function highlight(index: number | null): void {
    for (const marked of tree.querySelectorAll(`.${DROP_TARGET_CLASS}`)) marked.classList.remove(DROP_TARGET_CLASS)
    if (index !== null) tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)[index]?.classList.add(DROP_TARGET_CLASS)
  }

  function targetOf(event: DragEvent): { directory: string; index: number | null } | null {
    const index = rowIndexOf(tree, event.target)
    const directory = containerOf(index === null ? undefined : context.rowAt(index))
    if (directory === null) return null
    if (dragging !== null && !canMoveInto(dragging, directory)) return null

    return { directory, index }
  }

  // Returns where the entry ended up, or null when nothing moved, so the
  // caller can show the user where it went rather than leaving it hidden
  // inside whichever folder it was dropped on.
  async function moveInto(from: string, directory: string): Promise<string | null> {
    const to = joinInto(directory, basenameOf(from))
    if (to === from) return null

    context.announce({ from, to, rewritten: await context.client.move(from, to) })

    return to
  }

  async function uploadAll(files: readonly File[], directory: string): Promise<void> {
    for (const file of files) {
      /* eslint-disable-next-line no-await-in-loop -- one request per file, so a
         rejected file does not discard the rest of the drop */
      await context.client.upload(directory, file).catch((error: unknown) => {
        context.toast.error(`${file.name}: ${describe(error)}`)
      })
    }
  }

  // Work may hand back something to do once the tree has been rebuilt, which
  // is the only point at which a newly moved row exists to be revealed.
  function run(work: () => Promise<(() => void) | undefined>): void {
    void (async () => {
      try {
        const after = await work()
        await context.refresh()
        after?.()
      } catch (error) {
        context.toast.error(describe(error))
      }
    })()
  }

  tree.addEventListener('dragstart', (event) => {
    const index = rowIndexOf(tree, event.target)
    const row = index === null ? undefined : context.rowAt(index)
    if (!isStoreRow(row)) return

    dragging = row.path
    event.dataTransfer?.setData(DRAG_MIME, row.path)
  })

  tree.addEventListener('dragend', () => {
    dragging = null
    highlight(null)
  })

  tree.addEventListener('dragover', (event) => {
    const target = targetOf(event)
    if (target === null) {
      highlight(null)
      return
    }

    // Without this the browser leaves the page to open the dragged file.
    event.preventDefault()
    highlight(target.index)
  })

  tree.addEventListener('dragleave', (event) => {
    if (event.target === tree) highlight(null)
  })

  tree.addEventListener('drop', (event) => {
    const target = targetOf(event)
    highlight(null)
    if (target === null || event.dataTransfer === null) return

    event.preventDefault()
    const transfer = event.dataTransfer
    const dropped = [...transfer.files]
    if (dropped.length > 0) {
      run(async () => {
        await uploadAll(dropped, target.directory)
        return undefined
      })
      return
    }

    const from = transfer.getData(DRAG_MIME)
    if (from === '') return

    run(async () => {
      const moved = await moveInto(from, target.directory)

      if (moved === null) return undefined

      return () => {
        context.revealPath(moved)
      }
    })
  })
}

export const TestOnly = { DRAG_MIME, DROP_TARGET_CLASS, canMoveInto, containerOf, joinInto }
