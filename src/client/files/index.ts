'use sanity'

import { openDocumentIn, type OpenDocument } from '../navigation.ts'
import { requestOpenAside } from '../open-aside.ts'
import { errorMessage } from '../error-message.ts'
import { announceDocumentMoved } from '../document-moved.ts'
import { createToast } from '../toast.ts'
import { onRevealRequested } from '../reveal-request.ts'
import { onStoreChanged } from '../store-changed.ts'

import { bindActions, updateArchiveLink, updateInsertAvailability, type ActionContext } from './actions.ts'
import { createDialogs, type Dialogs } from './dialogs.ts'
import { bindDragAndDrop } from './drag.ts'
import { directoryOf } from '../../shared/link-paths.ts'
import { collectRuns } from './rebuild.ts'
import { createFilesClient, type FilesClient } from './files-client.ts'
import { openFolders, pruneOpenFolders, readOpenFolders, setFolderOpen } from './open-folders.ts'
import { ancestorsOf, folderPathsIn, type TrashNode, type TreeNode } from './tree-model.ts'
import { isAtOrUnder, STORE_ROOT } from '../../shared/store-path.ts'
import { requestInsert } from '../insert-entry.ts'
import { requestKeep } from '../keep-request.ts'
import { docUrlFor } from '../doc-path.ts'
import { focusRowAt } from '../tree-rows.ts'
import { KEYS } from '../help.ts'
import {
  EMPTY_TRASH_SELECTOR,
  isStoreRow,
  renderTree,
  rowIndexOf,
  ROW_SELECTOR,
  TRASH_PATH,
  TREE_SELECTOR,
  type VisibleRow,
} from './tree-view.ts'

interface FileTreeOptions {
  root?: ParentNode
  pathname?: string
  client?: FilesClient
  dialogs?: Dialogs
  navigate?: (url: string) => void
}

const NEXT_ROW = 1
const ONE_ENTRY = 1
const PREVIOUS_ROW = -1
const LAST_ANCESTOR = -1

function opensAside(event: MouseEvent): boolean {
  return event.ctrlKey || event.metaKey
}

function opensElsewhere(event: MouseEvent): boolean {
  return event.shiftKey || event.altKey
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

interface FileTree {
  settled: () => Promise<void>
  teardownFileTree: () => void
}

export async function initFileTree(options: FileTreeOptions = {}): Promise<FileTree> {
  const root = options.root ?? document
  const tree = root.querySelector<HTMLElement>(TREE_SELECTOR)
  if (tree === null) return { settled: collectRuns().settled, teardownFileTree: () => undefined }

  return await runFileTree({
    tree,
    root,
    client: options.client ?? createFilesClient(),
    dialogs: options.dialogs ?? createDialogs(root),
    openDocument: openDocumentIn(root, options.pathname),
    navigate: options.navigate ?? assignLocation,
  })
}

async function runFileTree({ tree, root, client, dialogs, openDocument, navigate }: Mounted): Promise<FileTree> {
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
    bindEmptyTrash()
    reflectSelection()
    if (focusPath !== undefined) focusAt(indexOfPath(focusPath))
  }

  function bindEmptyTrash(): void {
    const button = tree.querySelector<HTMLElement>(EMPTY_TRASH_SELECTOR)

    button?.addEventListener('click', (event) => {
      event.preventDefault()
      event.stopPropagation()

      if (button.dataset.armed === undefined) {
        button.dataset.armed = 'yes'
        button.replaceChildren(`Delete ${entriesIn(trash.length)} for good`)

        return
      }

      runs.track(
        emptyTrash().catch((error: unknown) => {
          toast.error(errorMessage(error))
        }),
      )
    })
  }

  function visibleSelection(): string | null {
    return visible.some((row) => row.path === selected) ? selected : null
  }

  function insertableSelection(): string | null {
    const entryPath = visibleSelection()
    if (entryPath === null || isAtOrUnder(TRASH_PATH, entryPath)) return null

    return entryPath
  }

  function targetDirectory(): string {
    if (selected === null || isAtOrUnder(TRASH_PATH, selected)) return STORE_ROOT

    const row = visible.find((candidate) => candidate.path === selected)
    if (row === undefined) return STORE_ROOT

    return row.expandable ? selected : directoryOf(selected)
  }

  function indexOfPath(entryPath: string): number {
    return visible.findIndex((candidate) => candidate.path === entryPath)
  }

  function focusAt(index: number): boolean {
    const { [index]: row } = visible
    if (row === undefined) return false

    focusRowAt(rows(), index)
    markSelected(row.path)

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

  function openFolderIndex(current: VisibleRow): void {
    if (!isStoreRow(current)) return

    navigate(`${docUrlFor(current.path)}/`)
  }

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

  function entriesIn(count: number): string {
    return `${String(count)} ${count === ONE_ENTRY ? 'entry' : 'entries'}`
  }

  async function emptyTrash(): Promise<void> {
    toast.show(`Deleted ${entriesIn(await client.emptyTrash())} for good`)
    await load()
  }

  tree.addEventListener('click', (event) => {
    const index = rowIndexOf(tree, event.target)
    const current = index === null ? undefined : visible[index]
    if (current === undefined) return

    if (!current.expandable) {
      if (opensElsewhere(event)) return

      event.preventDefault()
      markSelected(current.path)
      if (opensAside(event)) requestOpenAside(root, current.path)
      else openRow(current)

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
    if (current === undefined) return

    event.preventDefault()
    if (current.expandable) {
      openFolderIndex(current)
      return
    }

    requestKeep(tree, current.path)
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

  function showPath(entryPath: string): void {
    openFolders(ancestorsOf(entryPath))
    selected = entryPath
    draw(readOpenFolders())
    rows()[indexOfPath(entryPath)]?.scrollIntoView({ block: 'nearest' })
  }

  function revealPath(entryPath: string): void {
    showPath(entryPath)
    focusAt(indexOfPath(entryPath))
  }

  function openPath(entryPath: string | null): void {
    const row = visible.find((candidate) => candidate.path === entryPath)
    if (row !== undefined) openRow(row)
  }

  function openCreated(entryPath: string): void {
    const isFolder = folderPathsIn(nodes).includes(entryPath)

    openFolders(isFolder ? [...ancestorsOf(entryPath), entryPath] : ancestorsOf(entryPath))
    selected = entryPath
    draw(readOpenFolders())
    focusAt(indexOfPath(entryPath))

    if (!isFolder) openPath(entryPath)
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
    openCreated,
    openSelected: () => {
      openPath(selected)
    },
  }
  bindActions(context)
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

  async function reload(): Promise<void> {
    try {
      await load()
    } catch (error) {
      toast.error(`Could not load the file browser: ${errorMessage(error)}`)
    }
  }

  const { offStoreChanged } = onStoreChanged(root, () => {
    runs.track(reload())
  })

  const { offRevealRequested } = onRevealRequested(root, showPath)

  await reload()

  return {
    settled: runs.settled,
    teardownFileTree: () => {
      offStoreChanged()
      offRevealRequested()
      toast.dismissRaised()
    },
  }
}
