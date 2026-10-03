'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'

import { nullWhenAbsent } from './absence.ts'
import { compareNamesIn } from './name-order.ts'
import { resolveFolderPath } from './safe-path.ts'
import { BlockedRestoreError, DocumentNotFoundError } from './store-errors.ts'
import { purgeFromTrash, readTrashMeta, trashPayloadPath } from './trash.ts'
import { isAtOrUnder, joinPath, STORE_ROOT } from '../../shared/store-path.ts'
import { serially } from '../../shared/serially.ts'
import { SEQUENCE_START } from '../../shared/sequences.ts'

const logRestore = createLogger('storage/trash-restore')

const INCLUSIVE_END = 1
const NOTHING_BLOCKED = 0
const NOTHING_LEFT = 0

export interface RestoreSelection {
  entryId: string
  paths: readonly string[]
}

export interface RestoreOutcome {
  restored: string[]
  entryRemains: boolean
}

interface Placement {
  within: string
  source: string
  destination: string
  target: string
}

interface Placed extends Placement {
  created: string | undefined
}

function rootsOf(paths: readonly string[]): string[] {
  const named = [...new Set(paths)]
  if (named.includes(STORE_ROOT)) return [STORE_ROOT]

  return named.filter((candidate) => !named.some((other) => other !== candidate && isAtOrUnder(other, candidate)))
}

function destinationOf(originalPath: string, within: string): string {
  return within === STORE_ROOT ? originalPath : joinPath(originalPath, within)
}

function sourceOf(payload: string, within: string): string {
  return within === STORE_ROOT ? payload : path.join(payload, within)
}

async function ancestorInTheWay(docsRoot: string, destination: string): Promise<string | null> {
  const segments = destination.split('/')
  segments.pop()

  const blocking = await Promise.all(
    segments.map(async (_segment, depth) => {
      const ancestor = segments.slice(SEQUENCE_START, depth + INCLUSIVE_END).join('/')
      const stats = await nullWhenAbsent(async () => await fs.stat(path.join(docsRoot, ancestor)))

      return stats !== null && !stats.isDirectory() ? ancestor : null
    }),
  )

  return blocking.find((ancestor) => ancestor !== null) ?? null
}

async function placementFor(
  docsRoot: string,
  payload: string,
  originalPath: string,
  within: string,
): Promise<Placement> {
  const source = sourceOf(payload, within)
  const present = await nullWhenAbsent(async () => await fs.stat(source))
  if (present === null) throw new DocumentNotFoundError(within)

  const destination = destinationOf(originalPath, within)

  return { within, source, destination, target: resolveFolderPath(docsRoot, destination) }
}

async function blockerFor(docsRoot: string, placement: Placement): Promise<string | null> {
  const occupant = await nullWhenAbsent(async () => await fs.stat(placement.target))
  if (occupant !== null) return placement.destination

  return await ancestorInTheWay(docsRoot, placement.destination)
}

async function removeIfEmpty(directory: string): Promise<void> {
  await fs.rmdir(directory).catch(() => undefined)
}

function madeFor(created: string, target: string): string[] {
  const levels: string[] = []
  let current = path.dirname(target)

  while (current.length > created.length) {
    levels.push(current)
    current = path.dirname(current)
  }
  levels.push(created)

  return levels
}

async function undo(placed: readonly Placed[]): Promise<void> {
  await serially([...placed].reverse(), async (done) => {
    await fs.rename(done.target, done.source)

    const { created } = done
    if (created !== undefined) await serially(madeFor(created, done.target), removeIfEmpty)
  })
}

async function place(placement: Placement): Promise<Placed> {
  const created = await fs.mkdir(path.dirname(placement.target), { recursive: true })

  await fs.rename(placement.source, placement.target)

  return { ...placement, created }
}

async function payloadIsEmpty(payload: string): Promise<boolean> {
  const left = await nullWhenAbsent(async () => await fs.readdir(payload))

  return left === null || left.length === NOTHING_LEFT
}

export async function restoreSelection(docsRoot: string, request: RestoreSelection): Promise<RestoreOutcome> {
  const { entryId } = request
  const meta = await readTrashMeta(docsRoot, entryId)
  const payload = trashPayloadPath(docsRoot, entryId)

  const placements: Placement[] = []
  await serially(rootsOf(request.paths), async (within) => {
    placements.push(await placementFor(docsRoot, payload, meta.originalPath, within))
  })

  const blocked = (await Promise.all(placements.map(async (placement) => await blockerFor(docsRoot, placement))))
    .filter((blocker) => blocker !== null)
    .sort(compareNamesIn())
  if (blocked.length > NOTHING_BLOCKED) throw new BlockedRestoreError(blocked)

  const placed: Placed[] = []
  try {
    await serially(placements, async (placement) => {
      placed.push(await place(placement))
    })
  } catch (error) {
    await undo(placed)
    throw error
  }

  const emptied = await payloadIsEmpty(payload)
  if (emptied) await purgeFromTrash(docsRoot, entryId)

  const restored = placed.map((done) => done.destination).sort(compareNamesIn())
  logRestore('restored %d of %s: %s', restored.length, entryId, restored.join(', '))

  return { restored, entryRemains: !emptied }
}
