'use sanity'

import type { Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { nullWhenAbsent } from './absence.ts'
import { isAtOrInside, realpathOrNull } from './containment.ts'
import { compareNamesIn } from './name-order.ts'
import { isAllowedName } from './safe-path.ts'
import { readTrashMeta, trashPayloadPath } from './trash.ts'
import { basenameOf } from '../../shared/link-paths.ts'
import { classifyFile, type EntryKind, type FileKind } from '../../shared/documents.ts'
import { serially } from '../../shared/serially.ts'
import { joinPath, STORE_ROOT } from '../../shared/store-path.ts'

interface Placement {
  name: string
  path: string
  restorable: boolean
  blockedBy: string | null
}

interface TrashFolderNode extends Placement {
  kind: 'folder'
  children: TrashEntryNode[]
}

interface TrashFileNode extends Placement {
  kind: FileKind
}

export type TrashEntryNode = TrashFolderNode | TrashFileNode

const FOLDER_RANK = 0
const FILE_RANK = 1
const SORT_EQUAL = 0

const FOLDERS_FIRST: Record<EntryKind, number> = { folder: FOLDER_RANK, document: FILE_RANK, image: FILE_RANK }

function compareNodes(a: TrashEntryNode, b: TrashEntryNode): number {
  const byKind = FOLDERS_FIRST[a.kind] - FOLDERS_FIRST[b.kind]

  return byKind === SORT_EQUAL ? compareNamesIn()(a.name, b.name) : byKind
}

interface Walk {
  docsRoot: string
  originalPath: string
}

function destinationOf(walk: Walk, within: string): string {
  return within === STORE_ROOT ? walk.originalPath : joinPath(walk.originalPath, within)
}

async function blockerOf(walk: Walk, within: string): Promise<string | null> {
  const destination = destinationOf(walk, within)
  const occupant = await nullWhenAbsent(async () => await fs.stat(path.join(walk.docsRoot, destination)))

  return occupant === null ? null : destination
}

async function placementOf(walk: Walk, name: string, within: string, allowed: boolean): Promise<Placement> {
  return {
    name,
    path: within,
    restorable: allowed,
    blockedBy: await blockerOf(walk, within),
  }
}

async function escapes(walk: Walk, target: string, entry: Dirent): Promise<boolean> {
  if (!entry.isSymbolicLink()) return false

  const real = await realpathOrNull(target)

  return real === null || !isAtOrInside(walk.docsRoot, real)
}

async function buildNode(walk: Walk, dir: string, prefix: string, entry: Dirent): Promise<TrashEntryNode | null> {
  const { name } = entry
  const target = path.join(dir, name)
  if (await escapes(walk, target, entry)) return null

  const within = joinPath(prefix, name)
  const allowed = isAllowedName(name)

  if (entry.isDirectory()) {
    return {
      ...(await placementOf(walk, name, within, allowed)),
      kind: 'folder',
      children: await walkPayload(walk, target, within, allowed),
    }
  }

  const kind = classifyFile(name)
  if (kind === null) return null

  return { ...(await placementOf(walk, name, within, allowed)), kind }
}

async function walkPayload(walk: Walk, dir: string, prefix: string, allowed: boolean): Promise<TrashEntryNode[]> {
  const entries = await nullWhenAbsent(async () => await fs.readdir(dir, { withFileTypes: true }))
  if (entries === null) return []

  const found: TrashEntryNode[] = []
  await serially(entries, async (entry) => {
    const built = await buildNode(walk, dir, prefix, entry)
    if (built !== null) found.push({ ...built, restorable: allowed && built.restorable })
  })

  return found.sort(compareNodes)
}

export async function readTrashEntry(docsRoot: string, entryId: string): Promise<TrashEntryNode> {
  const meta = await readTrashMeta(docsRoot, entryId)
  const walk: Walk = { docsRoot, originalPath: meta.originalPath }
  const payload = trashPayloadPath(docsRoot, entryId)
  const name = basenameOf(meta.originalPath)
  const placement = await placementOf(walk, name, STORE_ROOT, isAllowedName(name))

  if (meta.kind !== 'folder') return { ...placement, kind: meta.kind }

  return { ...placement, kind: 'folder', children: await walkPayload(walk, payload, STORE_ROOT, placement.restorable) }
}
