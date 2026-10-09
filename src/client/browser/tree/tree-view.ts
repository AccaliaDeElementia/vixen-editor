'use sanity'

import { treeGroup } from './tree-rows.ts'
import { applyRovingTabindex, drawnIn, itemFor, ROOT_DEPTH, row, syncChildren, type VisibleRow } from './drawing.ts'

import { docUrlFor } from '../../platform/doc-path.ts'

import type { TreeNode } from './tree-model.ts'

export const TREE_SELECTOR = '#file-tree'

const ONE_LEVEL_DEEPER = 1

export interface TreeViewModel {
  nodes: readonly TreeNode[]
  open: ReadonlySet<string>
  selected: string | null
}

function group(): HTMLElement {
  return treeGroup('tree__group')
}

interface Rendered {
  items: HTMLElement[]
  visible: VisibleRow[]
}

function groupIn(item: HTMLElement): HTMLElement {
  return item.querySelector<HTMLElement>(':scope > ul') ?? group()
}

function renderNodes(
  nodes: readonly TreeNode[],
  model: TreeViewModel,
  depth: number,
  drawn: Map<string, HTMLElement>,
): Rendered {
  const items: HTMLElement[] = []
  const visible: VisibleRow[] = []

  for (const node of nodes) {
    const selected = node.path === model.selected

    if (node.kind !== 'folder') {
      const href = docUrlFor(node.path)
      const options = { path: node.path, kind: node.kind, name: node.name, depth, expanded: null, selected, href }
      const shown = row({ ...options, draggable: true }, drawn)
      const item = itemFor(shown)
      syncChildren(item, [shown])
      items.push(item)
      visible.push({ path: node.path, expandable: false, kind: node.kind, opens: href })
      continue
    }

    const expanded = model.open.has(node.path)
    const shown = row(
      { path: node.path, kind: 'folder', name: node.name, depth, expanded, selected, draggable: true },
      drawn,
    )
    const element = itemFor(shown)
    items.push(element)
    visible.push({ path: node.path, expandable: true, kind: 'folder', opens: null })

    if (!expanded) {
      syncChildren(element, [shown])
      continue
    }

    const nested = renderNodes(node.children, model, depth + ONE_LEVEL_DEEPER, drawn)
    const children = groupIn(element)
    syncChildren(children, nested.items)
    syncChildren(element, [shown, children])
    visible.push(...nested.visible)
  }

  return { items, visible }
}

export function renderTree(tree: Element, model: TreeViewModel): VisibleRow[] {
  const drawn = drawnIn(tree)
  const main = renderNodes(model.nodes, model, ROOT_DEPTH, drawn)

  syncChildren(tree, main.items)
  applyRovingTabindex(tree)

  return main.visible
}
