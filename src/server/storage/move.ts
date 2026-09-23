'use sanity'

import type { Stats } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'

import { isAtOrInside, nullWhenAbsent } from './containment.ts'
import { InvalidPathError, resolveFolderPath } from './safe-path.ts'
import { InvalidMoveError, WouldOverwriteError } from './store-errors.ts'
import { classifyFile } from './tree.ts'
import { entryKindOf, moveToTrash, type TrashKind } from './trash.ts'

const logMove = createLogger('storage/move')

export interface MoveRequest {
  from: string
  to: string
  allowOverwrite: boolean
}

interface Pair {
  fromTarget: string
  toTarget: string
  toPath: string
}

async function statOrNull(target: string): Promise<Stats | null> {
  return await nullWhenAbsent(async () => await fs.stat(target))
}

// Walks the two trees together and records the destination paths that a move
// would destroy. Two directories merge, so only the leaves where something
// non-mergeable already sits are losses.
async function collectCollisions(at: Pair, found: string[]): Promise<void> {
  const toStats = await statOrNull(at.toTarget)
  if (toStats === null) return

  const fromStats = await statOrNull(at.fromTarget)
  if (fromStats === null || !fromStats.isDirectory() || !toStats.isDirectory()) {
    found.push(at.toPath)
    return
  }

  for (const child of await fs.readdir(at.fromTarget)) {
    /* eslint-disable-next-line no-await-in-loop -- a recursive directory walk is
       inherently sequential, and fanning out with Promise.all would risk
       exhausting file descriptors on a deep document tree for no real gain */
    await collectCollisions(
      {
        fromTarget: path.join(at.fromTarget, child),
        toTarget: path.join(at.toTarget, child),
        toPath: `${at.toPath}/${child}`,
      },
      found,
    )
  }
}

async function moveInto(fromTarget: string, toTarget: string): Promise<void> {
  const toStats = await statOrNull(toTarget)

  if (toStats === null) {
    await fs.mkdir(path.dirname(toTarget), { recursive: true })
    await fs.rename(fromTarget, toTarget)
    return
  }

  // Reaching here means both sides are directories, because every collision
  // that was not a mergeable directory has already been moved to the trash.
  for (const child of await fs.readdir(fromTarget)) {
    /* eslint-disable-next-line no-await-in-loop -- a recursive directory walk is
       inherently sequential, and fanning out with Promise.all would risk
       exhausting file descriptors on a deep document tree for no real gain */
    await moveInto(path.join(fromTarget, child), path.join(toTarget, child))
  }

  await fs.rmdir(fromTarget)
}

// A rename may not change what a file claims to be: the raw route types a
// response from the extension alone, so turning notes.md into notes.svg would
// have the server describe prose as an image.
function assertKindSurvives(from: string, to: string, fromKind: TrashKind): void {
  if (fromKind === 'folder') return

  if (classifyFile(path.basename(to)) !== fromKind) {
    throw new InvalidPathError(to, `must keep the same kind of extension as ${from}`)
  }
}

export async function moveEntry(root: string, request: MoveRequest): Promise<void> {
  const { from, to, allowOverwrite } = request
  if (from === '' || to === '') throw new InvalidPathError('', 'must not be the document root')

  const fromTarget = resolveFolderPath(root, from)
  const toTarget = resolveFolderPath(root, to)
  if (fromTarget === toTarget) return

  if (isAtOrInside(fromTarget, toTarget)) throw new InvalidMoveError(from, to)

  assertKindSurvives(from, to, await entryKindOf(from, fromTarget))

  const collisions: string[] = []
  await collectCollisions({ fromTarget, toTarget, toPath: to }, collisions)
  if (collisions.length > 0 && !allowOverwrite) throw new WouldOverwriteError(collisions)

  // Trashing every loser first means a confirmed overwrite stays recoverable,
  // and that a failure here leaves the move itself untouched.
  for (const collision of collisions) {
    /* eslint-disable-next-line no-await-in-loop -- the write lock is held for the
       whole move, so these run one at a time regardless; sequencing them keeps
       a failure from leaving some entries trashed and others half-trashed */
    await moveToTrash(root, collision)
  }

  await moveInto(fromTarget, toTarget)
  logMove('moved %s to %s, replacing %d', from, to, collisions.length)
}
