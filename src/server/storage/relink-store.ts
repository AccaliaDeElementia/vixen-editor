'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'
import { movedPath, relinkDocument, type PathMove } from '../markdown/relink.ts'

import { replaceFileAtomic } from './atomic-write.ts'
import { serially } from '../../shared/serially.ts'

const logRelink = createLogger('storage/relink-store')
const logFailed = createLogger('storage/relink-store', 'failed')

export interface RelinkOutcome {
  rewritten: string[]
  failed: string[]
}

function holderOfEachPath(documentIds: readonly string[], moves: readonly PathMove[]): Map<string, string> {
  return new Map(documentIds.map((id) => [movedPath(moves, id), id]))
}

// CommonMark allows no whitespace between the bracket and what follows it, so
// every form this repairs needs `](` or `]:` written literally and no escaping
// or encoding can produce one without it appearing.
function mayHoldLinks(content: string): boolean {
  return content.includes('](') || content.includes(']:')
}

async function repair(target: string, holder: string, moves: readonly PathMove[]): Promise<boolean> {
  const content = await fs.readFile(target, 'utf8')
  if (!mayHoldLinks(content)) return false

  const relinked = relinkDocument(content, holder, moves)
  if (relinked === content) return false

  await replaceFileAtomic(target, relinked)

  return true
}

export async function relinkAfterMove(
  root: string,
  documentIds: readonly string[],
  moves: readonly PathMove[],
): Promise<RelinkOutcome> {
  const rewritten: string[] = []
  const failed: string[] = []

  await serially(holderOfEachPath(documentIds, moves), async ([current, holder]) => {
    try {
      if (await repair(path.join(root, current), holder, moves)) rewritten.push(current)
    } catch (error) {
      failed.push(current)
      logFailed('%s: %O', current, error)
    }
  })

  logRelink('rewrote %d, failed %d, of %d documents', rewritten.length, failed.length, documentIds.length)

  return { rewritten: rewritten.sort(compare), failed: failed.sort(compare) }
}

function compare(a: string, b: string): number {
  return a.localeCompare(b)
}
