'use sanity'

import type { EntryKind } from '../../shared/documents.ts'

import type { TrashNode } from './tree-model.ts'

const DIRECT_FIRST = -1
const ANCESTOR_LAST = 1
const SAME_GROUP = 0

export interface RestoreCandidate {
  id: string
  originalPath: string
  deletedAt: string
  kind: EntryKind
  whole: boolean
  blockedBy: string | null
}

function mightContain(entry: TrashNode, missingPath: string): boolean {
  return entry.kind === 'folder' && missingPath.startsWith(`${entry.originalPath}/`)
}

function candidateFor(entry: TrashNode, missingPath: string, livePaths: ReadonlySet<string>): RestoreCandidate | null {
  const direct = entry.originalPath === missingPath
  if (!direct && !mightContain(entry, missingPath)) return null

  const occupied = !direct && livePaths.has(entry.originalPath)

  return {
    id: entry.id,
    originalPath: entry.originalPath,
    deletedAt: entry.deletedAt,
    kind: entry.kind,
    whole: !direct,
    blockedBy: occupied ? entry.originalPath : null,
  }
}

function byDirectnessThenRecency(left: RestoreCandidate, right: RestoreCandidate): number {
  if (left.whole !== right.whole) return left.whole ? ANCESTOR_LAST : DIRECT_FIRST
  if (left.deletedAt === right.deletedAt) return SAME_GROUP

  return left.deletedAt > right.deletedAt ? DIRECT_FIRST : ANCESTOR_LAST
}

export function restoreCandidatesFor(
  missingPath: string,
  trash: readonly TrashNode[],
  livePaths: ReadonlySet<string>,
): RestoreCandidate[] {
  return trash.flatMap((entry) => candidateFor(entry, missingPath, livePaths) ?? []).sort(byDirectnessThenRecency)
}
