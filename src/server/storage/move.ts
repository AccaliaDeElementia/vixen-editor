'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'

import { nullWhenAbsent } from './absence.ts'
import { isAtOrInside } from './containment.ts'
import { assertNormalisedName, InvalidPathError, resolveFolderPath } from './safe-path.ts'
import { mediaTypeOf } from './media-type.ts'
import { EntryExistsError, InvalidMoveError } from './store-errors.ts'
import { classifyFile } from '../../shared/documents.ts'
import { entryKindOf } from './trash.ts'
import type { EntryKind } from '../../shared/documents.ts'

const logMove = createLogger('storage/move')

export interface MoveRequest {
  from: string
  to: string
}

export function assertKindSurvives(from: string, to: string, fromKind: EntryKind): void {
  if (fromKind === 'folder') return

  if (classifyFile(path.basename(to)) !== fromKind) {
    throw new InvalidPathError(to, `must keep the same kind of extension as ${from}`)
  }

  if (fromKind === 'image' && mediaTypeOf(to) !== mediaTypeOf(from)) {
    throw new InvalidPathError(to, `must keep the same image format as ${from}`)
  }
}

export async function moveEntry(root: string, request: MoveRequest): Promise<void> {
  const { from, to } = request
  if (from === '' || to === '') throw new InvalidPathError('', 'must not be the document root')

  assertNormalisedName(to)

  const fromTarget = resolveFolderPath(root, from)
  const toTarget = resolveFolderPath(root, to)
  if (fromTarget === toTarget) return

  if (isAtOrInside(fromTarget, toTarget)) throw new InvalidMoveError(from, to)

  assertKindSurvives(from, to, await entryKindOf(from, fromTarget))

  const occupant = await nullWhenAbsent(async () => await fs.stat(toTarget))
  if (occupant !== null) throw new EntryExistsError(to)

  await fs.mkdir(path.dirname(toTarget), { recursive: true })
  await fs.rename(fromTarget, toTarget)

  logMove('moved %s to %s', from, to)
}
