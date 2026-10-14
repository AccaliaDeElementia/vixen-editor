'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../platform/logging.ts'
import { compareNames } from './primitives/name-order.ts'
import { movedPath, type PathMove } from '../../shared/store-path.ts'

import { replaceFileAtomic } from './primitives/atomic-write.ts'
import { serially } from '../../shared/serially.ts'

const logRelink = createLogger('storage/relink-store')
const logFailed = createLogger('storage/relink-store', 'failed')

export interface RelinkOutcome {
  rewritten: string[]
  failed: string[]
}

export type Rewrite = (content: string, holder: string, moves: readonly PathMove[]) => string | null

function holderOfEachPath(documentIds: readonly string[], moves: readonly PathMove[]): Map<string, string> {
  return new Map(documentIds.map((id) => [movedPath(moves, id), id]))
}

async function repair(target: string, holder: string, moves: readonly PathMove[], rewrite: Rewrite): Promise<boolean> {
  const content = await fs.readFile(target, 'utf8')
  const relinked = rewrite(content, holder, moves)
  if (relinked === null) return false

  await replaceFileAtomic(target, relinked)

  return true
}

export async function relinkAfterMove(
  root: string,
  documentIds: readonly string[],
  moves: readonly PathMove[],
  rewrite: Rewrite,
): Promise<RelinkOutcome> {
  const rewritten: string[] = []
  const failed: string[] = []

  await serially(holderOfEachPath(documentIds, moves), async ([current, holder]) => {
    try {
      if (await repair(path.join(root, current), holder, moves, rewrite)) rewritten.push(current)
    } catch (error) {
      failed.push(current)
      logFailed('%s: %O', current, error)
    }
  })

  logRelink('rewrote %d, failed %d, of %d documents', rewritten.length, failed.length, documentIds.length)

  return { rewritten: rewritten.sort(compareNames), failed: failed.sort(compareNames) }
}
