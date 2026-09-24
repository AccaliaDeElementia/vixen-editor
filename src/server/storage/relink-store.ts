'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { createLogger } from '../logging.ts'
import { movedPath, relinkDocument, type PathMove } from '../markdown/relink.ts'

import { replaceFileAtomic } from './atomic-write.ts'

const logRelink = createLogger('storage/relink-store')
const logFailed = createLogger('storage/relink-store', 'failed')

export interface RelinkOutcome {
  rewritten: string[]
  failed: string[]
}

function holderOfEachPath(documentIds: readonly string[], moves: readonly PathMove[]): Map<string, string> {
  const holders = new Map<string, string>()

  for (const id of documentIds) {
    const current = movedPath(moves, id)
    if (current !== id || !holders.has(current)) holders.set(current, id)
  }

  return holders
}

// Every form this repairs — inline link, image, reference definition — needs
// `](` or `]:` written literally, and CommonMark allows no whitespace between
// the bracket and what follows it, so no escaping or encoding can produce one
// without it appearing. A document with neither holds nothing to repair, and
// parsing is most of what a move costs.
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

  for (const [current, holder] of holderOfEachPath(documentIds, moves)) {
    try {
      /* eslint-disable-next-line no-await-in-loop -- one document at a time, for
         the same reason the document walk is sequential: fanning out over a large
         store would hold every file open at once */
      if (await repair(path.join(root, current), holder, moves)) rewritten.push(current)
    } catch (error) {
      failed.push(current)
      logFailed('%s: %O', current, error)
    }
  }

  logRelink('rewrote %d, failed %d, of %d documents', rewritten.length, failed.length, documentIds.length)

  return { rewritten: rewritten.sort(compare), failed: failed.sort(compare) }
}

function compare(a: string, b: string): number {
  return a.localeCompare(b)
}
