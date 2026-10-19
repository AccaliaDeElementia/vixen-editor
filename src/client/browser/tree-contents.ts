'use sanity'

import { panelShowing, TRASH_PANEL } from '../platform/panels.ts'
import { renderTrashPanel } from './trash/trash-view.ts'
import { folderPathsIn, type TrashNode, type TreeNode } from './tree/tree-model.ts'
import { ROW_SELECTOR, type VisibleRow } from './tree/drawing.ts'
import { renderTree } from './tree/tree-view.ts'

interface TreeContentsOptions {
  root: ParentNode
  tree: HTMLElement
  trashList: HTMLElement | null
  selected: () => string | null
}

interface TreeContents {
  replaceWith: (nodes: readonly TreeNode[], trash: readonly TrashNode[]) => void
  openTo: (folders: ReadonlySet<string>) => void
  repaint: () => void
  openFolders: () => ReadonlySet<string>
  isOpen: (entryPath: string) => boolean
  folderPaths: () => string[]
  trashHeld: () => number
  shown: () => readonly VisibleRow[]
  rowAt: (index: number) => VisibleRow | undefined
  rowFor: (entryPath: string | null) => VisibleRow | undefined
  rowElements: () => HTMLElement[]
  shownHost: () => HTMLElement
  showingTheTrash: () => boolean
}

export function createTreeContents({ root, tree, trashList, selected }: TreeContentsOptions): TreeContents {
  let nodes: readonly TreeNode[] = []
  let trash: readonly TrashNode[] = []
  let open: ReadonlySet<string> = new Set()
  let visible: readonly VisibleRow[] = []

  function showingTheTrash(): boolean {
    return trashList !== null && panelShowing(root) === TRASH_PANEL
  }

  function trashInFront(): HTMLElement | null {
    return showingTheTrash() ? trashList : null
  }

  function shownHost(): HTMLElement {
    return trashInFront() ?? tree
  }

  return {
    showingTheTrash,
    shownHost,

    replaceWith: (replacement: readonly TreeNode[], trashed: readonly TrashNode[]) => {
      nodes = replacement
      trash = trashed
    },

    openTo: (folders: ReadonlySet<string>) => {
      open = folders
    },

    repaint: () => {
      const inFront = trashInFront()
      visible =
        inFront === null
          ? renderTree(tree, { nodes, open, selected: selected() })
          : renderTrashPanel(inFront, { trash, selected: selected() })
    },

    openFolders: () => open,
    isOpen: (entryPath: string) => open.has(entryPath),
    folderPaths: () => folderPathsIn(nodes),
    trashHeld: () => trash.length,
    shown: () => visible,
    rowAt: (index: number) => visible[index],
    rowFor: (entryPath: string | null) => visible.find((candidate) => candidate.path === entryPath),
    rowElements: () => [...shownHost().querySelectorAll<HTMLElement>(ROW_SELECTOR)],
  }
}
