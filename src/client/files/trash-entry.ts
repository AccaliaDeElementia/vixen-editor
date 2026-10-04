'use sanity'

import { isEntryKind, type EntryKind } from '../../shared/documents.ts'
import { isRecord } from '../../shared/guards.ts'

export interface TrashEntryNode {
  name: string
  path: string
  kind: EntryKind
  restorable: boolean
  blockedBy: string | null
  children: TrashEntryNode[]
}

function parseNode(value: unknown): TrashEntryNode | null {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.path !== 'string') return null
  if (!isEntryKind(value.kind) || typeof value.restorable !== 'boolean') return null

  const blockedBy = typeof value.blockedBy === 'string' ? value.blockedBy : null

  return {
    name: value.name,
    path: value.path,
    kind: value.kind,
    restorable: value.restorable,
    blockedBy,
    children: parseNodes(value.children),
  }
}

function parseNodes(value: unknown): TrashEntryNode[] {
  return Array.isArray(value) ? value.flatMap((child: unknown) => parseNode(child) ?? []) : []
}

export function parseTrashEntry(payload: unknown): TrashEntryNode | null {
  return isRecord(payload) ? parseNode(payload.entry) : null
}

export function pathsUnder(node: TrashEntryNode): string[] {
  return [node.path, ...node.children.flatMap(pathsUnder)]
}
