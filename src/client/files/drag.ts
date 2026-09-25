'use sanity'

import type { DocumentMoved } from '../document-moved.ts'
import { EMPTY, PAST_SEPARATOR } from '../../shared/sequences.ts'
import { errorMessage } from '../error-message.ts'
import type { Toast } from '../layout/toast.ts'

import type { Dialogs } from './dialogs.ts'
import type { FilesClient } from './files-client.ts'
import { isStoreRow, rowIndexOf, ROW_SELECTOR, type VisibleRow } from './tree-view.ts'
import { joinPath, parentOf, STORE_ROOT } from './tree-model.ts'

type OnceRebuilt = () => void

type DropDirectory = string

type DestinationPath = string

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

function basenameOf(entryPath: string): string {
  return entryPath.slice(entryPath.lastIndexOf('/') + PAST_SEPARATOR)
}

function containerOf(row: VisibleRow | undefined): DropDirectory | null {
  if (row === undefined) return STORE_ROOT
  if (!isStoreRow(row)) return null

  return row.kind === 'folder' ? row.path : parentOf(row.path)
}

function canMoveInto(source: string, directory: string): boolean {
  return directory !== source && !directory.startsWith(`${source}/`)
}

export function bindDragAndDrop(context: DragContext, tree: HTMLElement): void {
  // Held here because `getData` is unreadable during dragover in a real
  // browser, and the affordance has to know what is being dragged to decide
  // whether a drop is legal at all.
  let dragging: string | null = null

  function clearDropTarget(): void {
    for (const marked of tree.querySelectorAll(`.${DROP_TARGET_CLASS}`)) marked.classList.remove(DROP_TARGET_CLASS)
  }

  function markDropTarget(rowIndex: number): void {
    clearDropTarget()
    tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)[rowIndex]?.classList.add(DROP_TARGET_CLASS)
  }

  function targetOf(event: DragEvent): { directory: string; index: number | null } | null {
    const index = rowIndexOf(tree, event.target)
    const directory = containerOf(index === null ? undefined : context.rowAt(index))
    if (directory === null) return null
    if (dragging !== null && !canMoveInto(dragging, directory)) return null

    return { directory, index }
  }

  async function moveInto(from: string, directory: string): Promise<DestinationPath | null> {
    const to = joinPath(directory, basenameOf(from))
    if (to === from) return null

    context.announce({ from, to, rewritten: await context.client.move(from, to) })

    return to
  }

  async function uploadAll(files: readonly File[], directory: string): Promise<void> {
    for (const file of files) {
      /* eslint-disable-next-line no-await-in-loop -- one request per file, so a
         rejected file does not discard the rest of the drop */
      await context.client.upload(directory, file).catch((error: unknown) => {
        context.toast.error(`${file.name}: ${errorMessage(error)}`)
      })
    }
  }

  function run(work: () => Promise<OnceRebuilt | undefined>): void {
    void (async () => {
      try {
        const after = await work()
        await context.refresh()
        after?.()
      } catch (error) {
        context.toast.error(errorMessage(error))
      }
    })()
  }

  tree.addEventListener('dragstart', (event) => {
    const index = rowIndexOf(tree, event.target)
    const row = index === null ? undefined : context.rowAt(index)
    if (!isStoreRow(row)) return

    const { path } = row
    dragging = path
    event.dataTransfer?.setData(DRAG_MIME, path)
  })

  tree.addEventListener('dragend', () => {
    dragging = null
    clearDropTarget()
  })

  tree.addEventListener('dragover', (event) => {
    const target = targetOf(event)
    if (target === null) {
      clearDropTarget()
      return
    }

    // Without this the browser leaves the page to open the dragged file.
    event.preventDefault()
    if (target.index === null) clearDropTarget()
    else markDropTarget(target.index)
  })

  tree.addEventListener('dragleave', (event) => {
    if (event.target === tree) clearDropTarget()
  })

  tree.addEventListener('drop', (event) => {
    const target = targetOf(event)
    clearDropTarget()
    if (target === null || event.dataTransfer === null) return

    event.preventDefault()
    const { dataTransfer: transfer } = event
    const dropped = [...transfer.files]
    if (dropped.length > EMPTY) {
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

export const TestOnly = { DRAG_MIME, DROP_TARGET_CLASS, canMoveInto, containerOf }
