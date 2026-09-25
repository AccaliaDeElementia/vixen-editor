'use sanity'

import { documentIdFromPath } from '../doc-path.ts'
import { errorMessage } from '../error-message.ts'
import { announceDocumentMoved } from '../document-moved.ts'
import { createToast } from '../layout/toast.ts'

import { bindActions, bindTrashActions, updateArchiveLink, type ActionContext } from './actions.ts'
import { createDialogs, type Dialogs } from './dialogs.ts'
import { bindDragAndDrop } from './drag.ts'
import { createFilesClient, type FilesClient } from './files-client.ts'
import { openFolders, pruneOpenFolders, readOpenFolders, setFolderOpen } from './open-folders.ts'
import { ancestorsOf, folderPathsIn, parentOf, STORE_ROOT, type TrashNode, type TreeNode } from './tree-model.ts'
import { renderTree, rowIndexOf, ROW_SELECTOR, TRASH_PATH, TREE_SELECTOR, type VisibleRow } from './tree-view.ts'

interface FileTreeOptions {
  root?: ParentNode
  pathname?: string
  client?: FilesClient
  dialogs?: Dialogs
}

const NEXT_ROW = 1
const PREVIOUS_ROW = -1
const LAST_ANCESTOR = -1

interface Mounted {
  tree: HTMLElement
  root: ParentNode
  client: FilesClient
  dialogs: Dialogs
  openDocument: string
}

export async function initFileTree(options: FileTreeOptions = {}): Promise<void> {
  const root = options.root ?? document
  const tree = root.querySelector<HTMLElement>(TREE_SELECTOR)
  if (tree === null) return

  await runFileTree({
    tree,
    root,
    client: options.client ?? createFilesClient(),
    dialogs: options.dialogs ?? createDialogs(root),
    openDocument: documentIdFromPath(options.pathname ?? window.location.pathname),
  })
}

async function runFileTree({ tree, root, client, dialogs, openDocument }: Mounted): Promise<void> {
  const toast = createToast(root)
  let nodes: readonly TreeNode[] = []
  let trash: readonly TrashNode[] = []
  let open: ReadonlySet<string> = new Set()
  let visible: VisibleRow[] = []
  let selected: string | null = openDocument

  function rows(): HTMLElement[] {
    return [...tree.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
  }

  function draw(next: ReadonlySet<string>, focusPath?: string): void {
    open = next
    visible = renderTree(tree, { nodes, trash, open, selected })
    updateArchiveLink(root, targetDirectory())
    if (focusPath !== undefined) focusAt(indexOfPath(focusPath))
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
    const next = rows()[index]
    if (next === undefined) return false

    for (const candidate of rows()) candidate.setAttribute('tabindex', '-1')
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
    if (!current.expandable) return false

    toggle(current.path)
    return true
  }

  function handleKey(key: string, current: VisibleRow): boolean {
    const index = visible.indexOf(current)

    if (key === 'ArrowDown') return focusAt(index + NEXT_ROW)
    if (key === 'ArrowUp') return focusAt(index + PREVIOUS_ROW)
    if (key === 'ArrowRight') return expandOrDescend(current, index)
    if (key === 'ArrowLeft') return collapseOrAscend(current, index)
    if (key === 'Enter') return activate(current)

    return false
  }

  tree.addEventListener('click', (event) => {
    const index = rowIndexOf(tree, event.target)
    const current = index === null ? undefined : visible[index]
    if (current === undefined) return

    selected = current.path
    if (!current.expandable) {
      draw(open)
      return
    }

    event.preventDefault()
    toggle(current.path)
  })

  tree.addEventListener('keydown', (event) => {
    const index = rowIndexOf(tree, event.target)
    const current = index === null ? undefined : visible[index]
    if (current === undefined) return

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
    revealPath(openDocument)
  }

  async function load(): Promise<void> {
    ;[nodes, trash] = await Promise.all([client.tree(), client.trash()])

    openFolders(ancestorsOf(openDocument))
    draw(pruneOpenFolders([...folderPathsIn(nodes), TRASH_PATH]))
  }

  const context: ActionContext = {
    root,
    client,
    dialogs,
    toast,
    targetDirectory,
    selectionPath: () => (visible.some((row) => row.path === selected) ? selected : null),
    refresh: load,
    reveal,
  }
  bindActions(context)
  bindTrashActions(context, tree)
  bindDragAndDrop(
    {
      client,
      dialogs,
      toast,
      rowAt: (index) => visible[index],
      refresh: load,
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
}
