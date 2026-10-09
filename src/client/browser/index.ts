'use sanity'

import { openDocumentIn, type OpenDocument } from '../platform/navigation.ts'
import { requestOpenAside } from '../platform/open-aside.ts'
import { errorMessage } from '../platform/error-message.ts'
import { announceDocumentMoved } from '../platform/document-moved.ts'
import { createToast } from '../platform/toast.ts'
import { onRevealRequested } from '../platform/reveal-request.ts'
import { onStoreChanged } from '../platform/store-changed.ts'
import { onPanelChanged } from '../platform/panel-changed.ts'

import { bindActions, type ActionContext } from './actions.ts'
import { createDialogs, type Dialogs } from '../platform/dialogs.ts'
import { bindDragAndDrop } from './drag.ts'
import { collectRuns } from './rebuild.ts'
import { createTrashPanel } from './trash-panel.ts'
import { createSelection } from './selection.ts'
import { createTreeKeyboard } from './tree-keyboard.ts'
import { createFilesClient, type FilesClient } from './files-client.ts'
import { openFolders, pruneOpenFolders, readOpenFolders, setFolderOpen } from './open-folders.ts'
import { ancestorsOf, folderPathsIn, type TrashNode, type TreeNode } from './tree-model.ts'
import { isAtOrUnder } from '../../shared/store-path.ts'
import { requestInsert } from '../platform/insert-entry.ts'
import { requestKeep } from '../platform/keep-request.ts'
import { KEYS } from '../platform/help.ts'
import {
  renderTrashPanel,
  renderTree,
  rowIndexOf,
  ROW_SELECTOR,
  TRASH_LIST_SELECTOR,
  TRASH_PATH,
  TREE_SELECTOR,
  type VisibleRow,
} from './tree-view.ts'
import { FILES_PANEL, panelShowing, showPanel, TRASH_PANEL } from '../platform/panels.ts'

interface FileTreeOptions {
  root?: ParentNode
  pathname?: string
  client?: FilesClient
  dialogs?: Dialogs
  navigate?: (url: string) => void
}

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
  trashList: HTMLElement | null
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
    trashList: root.querySelector<HTMLElement>(TRASH_LIST_SELECTOR),
    tree,
    root,
    client: options.client ?? createFilesClient(),
    dialogs: options.dialogs ?? createDialogs(root),
    openDocument: openDocumentIn(root, options.pathname),
    navigate: options.navigate ?? assignLocation,
  })
}

async function runFileTree({
  trashList,
  tree,
  root,
  client,
  dialogs,
  openDocument,
  navigate,
}: Mounted): Promise<FileTree> {
  const toast = createToast(root)
  let nodes: readonly TreeNode[] = []
  let trash: readonly TrashNode[] = []
  let open: ReadonlySet<string> = new Set()
  let visible: VisibleRow[] = []

  const { insertableSelection, markSelected, reflect, select, selectedPath, targetDirectory, visibleSelection } =
    createSelection({
      root,
      shown: () => visible,
      elements: rows,
      startingAt: openDocument.path(),
    })

  const keyboard = createTreeKeyboard({
    shown: () => visible,
    elements: rows,
    isOpen: (entryPath: string) => open.has(entryPath),
    toggle: (entryPath: string) => {
      toggle(entryPath)
    },
    select: (entryPath: string) => {
      markSelected(entryPath)
    },
    navigate,
  })
  const { focusAt, handleKey, indexOfPath, openFolderIndex, openRow } = keyboard

  const trashPanel = createTrashPanel({
    root,
    client,
    dialogs,
    toast,
    held: () => trash.length,
    reload: async () => {
      await load()
    },
    track: (work: Promise<void>) => {
      runs.track(work)
    },
  })

  function showingTheTrash(): boolean {
    return trashList !== null && panelShowing(root) === TRASH_PANEL
  }

  function shownHost(): HTMLElement {
    return showingTheTrash() && trashList !== null ? trashList : tree
  }

  const rowHosts = trashList === null ? [tree] : [tree, trashList]

  function rows(): HTMLElement[] {
    return [...shownHost().querySelectorAll<HTMLElement>(ROW_SELECTOR)]
  }

  let draggingFromTheTree = false
  let heldBackADraw = false

  function draw(next: ReadonlySet<string>, focusPath?: string): void {
    open = next
    if (draggingFromTheTree) {
      heldBackADraw = true

      return
    }

    visible =
      showingTheTrash() && trashList !== null
        ? renderTrashPanel(trashList, { trash, selected: selectedPath() })
        : renderTree(tree, { nodes, open, selected: selectedPath() })
    trashPanel.paint()
    reflect()
    if (focusPath !== undefined) focusAt(indexOfPath(focusPath))
  }

  function toggle(entryPath: string): void {
    setFolderOpen(entryPath, !open.has(entryPath))
    draw(readOpenFolders(), entryPath)
  }

  function insertSelected(): void {
    const entryPath = insertableSelection()
    if (entryPath === null) {
      toast.error('Select a file in the browser first, then insert it')

      return
    }

    requestInsert(tree, entryPath)
  }

  function listenOnRows<Name extends keyof HTMLElementEventMap>(
    type: Name,
    handle: (event: HTMLElementEventMap[Name]) => void,
  ): void {
    for (const host of rowHosts) host.addEventListener(type, handle)
  }

  listenOnRows('click', (event) => {
    const index = rowIndexOf(shownHost(), event.target)
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
    select(path)
    toggle(path)
  })

  listenOnRows('dblclick', (event) => {
    const index = rowIndexOf(shownHost(), event.target)
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

  listenOnRows('keydown', (event) => {
    const index = rowIndexOf(shownHost(), event.target)
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
    showPanel(root, isAtOrUnder(TRASH_PATH, entryPath) ? TRASH_PANEL : FILES_PANEL)

    openFolders(ancestorsOf(entryPath))
    select(entryPath)
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
    select(entryPath)
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
      openPath(selectedPath())
    },
  }
  bindActions(context)
  trashPanel.bind()
  const panels = onPanelChanged(root, () => {
    draw(open)
  })
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

  tree.addEventListener('pointerdown', () => {
    draggingFromTheTree = true
  })

  tree.addEventListener('dragstart', () => {
    draggingFromTheTree = true
  })

  function theDragIsOver(): void {
    draggingFromTheTree = false
    if (!heldBackADraw) return

    heldBackADraw = false
    draw(open)
  }

  const RELEASES = ['pointerup', 'pointercancel', 'dragend', 'drop']
  const { ownerDocument: releasedOn } = tree

  for (const release of RELEASES) releasedOn.addEventListener(release, theDragIsOver)

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
      panels.offPanelChanged()
      for (const release of RELEASES) releasedOn.removeEventListener(release, theDragIsOver)
      toast.dismissRaised()
    },
  }
}
