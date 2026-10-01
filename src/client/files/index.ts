'use sanity'

import { openDocumentIn, type OpenDocument } from '../navigation.ts'
import { errorMessage } from '../error-message.ts'
import { announceDocumentMoved } from '../document-moved.ts'
import { createToast } from '../layout/toast.ts'

import {
  bindActions,
  bindTrashActions,
  updateArchiveLink,
  updateInsertAvailability,
  type ActionContext,
} from './actions.ts'
import { createDialogs, type Dialogs } from './dialogs.ts'
import { bindDragAndDrop } from './drag.ts'
import { collectRuns } from './rebuild.ts'
import { createFilesClient, type FilesClient } from './files-client.ts'
import { openFolders, pruneOpenFolders, readOpenFolders, setFolderOpen } from './open-folders.ts'
import { ancestorsOf, folderPathsIn, parentOf, type TrashNode, type TreeNode } from './tree-model.ts'
import { STORE_ROOT } from '../../shared/store-path.ts'
import { requestInsert } from '../insert-entry.ts'
import { KEYS } from '../help.ts'
import { renderTree, rowIndexOf, ROW_SELECTOR, TRASH_PATH, TREE_SELECTOR, type VisibleRow } from './tree-view.ts'

interface FileTreeOptions {
  root?: ParentNode
  pathname?: string
  client?: FilesClient
  dialogs?: Dialogs
  navigate?: (url: string) => void
}

const NEXT_ROW = 1
const PREVIOUS_ROW = -1
const LAST_ANCESTOR = -1

function opensElsewhere(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
}

function assignLocation(url: string): void {
  window.location.assign(url)
}

interface Mounted {
  tree: HTMLElement
  root: ParentNode
  client: FilesClient
  dialogs: Dialogs
  openDocument: OpenDocument
  navigate: (url: string) => void
}

export async function initFileTree(options: FileTreeOptions = {}): Promise<() => Promise<void>> {
  const root = options.root ?? document
  const tree = root.querySelector<HTMLElement>(TREE_SELECTOR)
  if (tree === null) return collectRuns().settled

  return await runFileTree({
    tree,
    root,
    client: options.client ?? createFilesClient(),
    dialogs: options.dialogs ?? createDialogs(root),
    openDocument: openDocumentIn(root, options.pathname),
    navigate: options.navigate ?? assignLocation,
  })
}

async function runFileTree({
  tree,
  root,
  client,
  dialogs,
  openDocument,
  navigate,
}: Mounted): Promise<() => Promise<void>> {
  const toast = createToast(root)
  let nodes: readonly TreeNode[] = []
  let trash: readonly TrashNode[] = []
  let open: ReadonlySet<string> = new Set()
  let visible: VisibleRow[] = []
  let selected: string | null = openDocument.path()

  function rows(): HTMLElement[] {
    return [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
  }

  function reflectSelection(): void {
    updateArchiveLink(root, targetDirectory())
    updateInsertAvailability(root, insertableSelection())
  }

  function markSelected(entryPath: string): void {
    selected = entryPath
    for (const element of rows()) element.setAttribute('aria-selected', String(element.dataset.path === entryPath))

    reflectSelection()
  }

  function openRow(current: VisibleRow): boolean {
    if (current.opens === null) return false

    navigate(current.opens)

    return true
  }

  function draw(next: ReadonlySet<string>, focusPath?: string): void {
    open = next
    visible = renderTree(tree, { nodes, trash, open, selected })
    reflectSelection()
    if (focusPath !== undefined) focusAt(indexOfPath(focusPath))
  }

  function visibleSelection(): string | null {
    return visible.some((row) => row.path === selected) ? selected : null
  }

  function insertableSelection(): string | null {
    const entryPath = visibleSelection()

    return entryPath === TRASH_PATH ? null : entryPath
  }

  function targetDirectory(): string {
    if (selected === null || selected === TRASH_PATH) return STORE_ROOT

    const row = visible.find((candidate) => candidate.path === selected)
    if (row === undefined) return STORE_ROOT

    return row.expandable ? selected : parentOf(selected)
  }

  function indexOfPath(entryPath: string): number {
    return visible.findIndex((candidate) => candidate.path === entryPath)
  }

  function focusAt(index: number): boolean {
    const rowsInTree = rows()
    const { [index]: next } = rowsInTree
    if (next === undefined) return false

    for (const candidate of rowsInTree) candidate.setAttribute('tabindex', '-1')
    next.setAttribute('tabindex', '0')
    next.focus()

    return true
  }

  function toggle(entryPath: string): void {
    setFolderOpen(entryPath, !open.has(entryPath))
    draw(readOpenFolders(), entryPath)
  }

  function expandOrDescend(current: VisibleRow, index: number): boolean {
    if (!current.expandable) return false
    if (!open.has(current.path)) {
      toggle(current.path)
      return true
    }

    return focusAt(index + NEXT_ROW)
  }

  function collapseOrAscend(current: VisibleRow, index: number): boolean {
    if (current.expandable && open.has(current.path)) {
      toggle(current.path)
      return true
    }

    const parent = ancestorsOf(current.path).at(LAST_ANCESTOR)

    return parent !== undefined && focusAt(indexOfPath(parent))
  }

  // Enter on a file is left to the browser: the row is a real link, so the
  // navigation, and opening it in a new tab, come for free.
  function activate(current: VisibleRow): boolean {
    if (!current.expandable) return openRow(current)

    toggle(current.path)
    return true
  }

  function handleKey(key: string, current: VisibleRow): boolean {
    const index = visible.indexOf(current)

    if (key === KEYS.nextRow) return focusAt(index + NEXT_ROW)
    if (key === KEYS.previousRow) return focusAt(index + PREVIOUS_ROW)
    if (key === KEYS.expandRow) return expandOrDescend(current, index)
    if (key === KEYS.collapseRow) return collapseOrAscend(current, index)
    if (key === KEYS.openRow) return activate(current)

    return false
  }

  function insertSelected(): void {
    const entryPath = insertableSelection()
    if (entryPath === null) {
      toast.error('Select a file in the browser first, then insert it')

      return
    }

    requestInsert(tree, entryPath)
  }

  tree.addEventListener('click', (event) => {
    const index = rowIndexOf(tree, event.target)
    const current = index === null ? undefined : visible[index]
    if (current === undefined) return

    if (!current.expandable) {
      if (opensElsewhere(event)) return

      event.preventDefault()
      markSelected(current.path)
      return
    }

    const { path } = current
    event.preventDefault()
    selected = path
    toggle(path)
  })

  tree.addEventListener('dblclick', (event) => {
    const index = rowIndexOf(tree, event.target)
    const current = index === null ? undefined : visible[index]
    if (current === undefined || current.expandable) return

    event.preventDefault()
    openRow(current)
  })

  function insertsSelected(event: KeyboardEvent): boolean {
    return event.key === KEYS.insert && (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey
  }

  tree.addEventListener('keydown', (event) => {
    const index = rowIndexOf(tree, event.target)
    const current = index === null ? undefined : visible[index]
    if (current === undefined) return

    if (insertsSelected(event)) {
      event.preventDefault()
      insertSelected()

      return
    }

    if (handleKey(event.key, current)) event.preventDefault()
  })

  function revealPath(entryPath: string): void {
    openFolders(ancestorsOf(entryPath))
    selected = entryPath
    draw(readOpenFolders())
    rows()[indexOfPath(entryPath)]?.scrollIntoView({ block: 'nearest' })
    focusAt(indexOfPath(entryPath))
  }

  function reveal(): void {
    revealPath(openDocument.path())
  }

  async function load(): Promise<void> {
    ;[nodes, trash] = await Promise.all([client.tree(), client.trash()])

    openFolders(ancestorsOf(openDocument.path()))
    draw(pruneOpenFolders([...folderPathsIn(nodes), TRASH_PATH]))
  }

  const runs = collectRuns()

  const context: ActionContext = {
    root,
    client,
    dialogs,
    toast,
    targetDirectory,
    selectionPath: visibleSelection,
    refresh: load,
    track: runs.track,
    reveal,
    insertSelected,
    openSelected: () => {
      const row = visible.find((candidate) => candidate.path === selected)
      if (row !== undefined) openRow(row)
    },
  }
  bindActions(context)
  bindTrashActions(context, tree)
  bindDragAndDrop(
    {
      client,
      toast,
      rowAt: (index) => visible[index],
      refresh: load,
      track: runs.track,
      revealPath,
      announce: (moved) => {
        announceDocumentMoved(root, moved)
      },
    },
    tree,
  )

  try {
    await load()
  } catch (error) {
    toast.error(`Could not load the file browser: ${errorMessage(error)}`)
  }

  return runs.settled
}
