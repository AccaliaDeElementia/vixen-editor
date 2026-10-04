'use sanity'

import { pathsUnder, type TrashEntryNode } from '../files/trash-entry.ts'

export type TickState = 'on' | 'off' | 'mixed'

export interface RestoreSelection {
  toggle: (path: string) => void
  stateOf: (path: string) => TickState
  roots: () => string[]
}

interface Known {
  node: TrashEntryNode
  parent: Known | null
}

function indexOf(entry: TrashEntryNode): Map<string, Known> {
  const known = new Map<string, Known>()

  function walk(node: TrashEntryNode, parent: Known | null): void {
    const here: Known = { node, parent }
    known.set(node.path, here)
    for (const child of node.children) walk(child, here)
  }
  walk(entry, null)

  return known
}

function standsAlone(node: TrashEntryNode): boolean {
  return node.restorable && node.blockedBy === null
}

export function createRestoreSelection(entry: TrashEntryNode): RestoreSelection {
  const known = indexOf(entry)
  const inDocumentOrder = pathsUnder(entry)
  const chosen = new Set<string>()

  function ancestorsOf(found: Known): Known[] {
    const { parent } = found

    return parent === null ? [] : [parent, ...ancestorsOf(parent)]
  }

  function rootAbove(found: Known): Known | null {
    return ancestorsOf(found).find((ancestor) => chosen.has(ancestor.node.path)) ?? null
  }

  function tick(found: Known): void {
    if (!standsAlone(found.node)) return

    for (const under of pathsUnder(found.node)) chosen.delete(under)
    chosen.add(found.node.path)
  }

  function spare(parent: Known, keeping: Known): void {
    for (const sibling of parent.node.children) {
      if (sibling.path !== keeping.node.path && standsAlone(sibling)) chosen.add(sibling.path)
    }
  }

  function untick(found: Known): void {
    const root = rootAbove(found)
    chosen.delete((root ?? found).node.path)
    if (root === null) return

    let below = found
    for (const ancestor of ancestorsOf(found)) {
      spare(ancestor, below)
      if (ancestor === root) return
      below = ancestor
    }
  }

  return {
    toggle(path: string): void {
      const found = known.get(path)
      if (found === undefined) return

      if (this.stateOf(path) === 'on') untick(found)
      else tick(found)
    },

    stateOf(path: string): TickState {
      const found = known.get(path)
      if (found === undefined) return 'off'
      if (chosen.has(path) || rootAbove(found) !== null) return 'on'

      return pathsUnder(found.node).some((under) => chosen.has(under)) ? 'mixed' : 'off'
    },

    roots(): string[] {
      return inDocumentOrder.filter((path) => chosen.has(path))
    },
  }
}
