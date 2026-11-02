'use sanity'

import { foldedMatchesIn } from '../../shared/case-folding.ts'
import { serially } from '../../shared/serially.ts'
import type { NameComparator } from './primitives/name-order.ts'

const MOST_HITS = 200
const EXCERPT_MAX = 120
const EXCERPT_LEAD = 30
const ELLIPSIS = '…'

const FIRST_LINE = 1
const NEWLINE = 1
const NOTHING_LEFT = 0
const LINE_START = 0

interface SearchHit {
  path: string
  line: number
  offset: number
  excerpt: string
}

interface SearchOutcome {
  hits: SearchHit[]
  capped: boolean
}

interface Scannable {
  list: (byName: NameComparator) => Promise<string[]>
  read: (id: string) => Promise<string>
}

interface SearchRequest {
  query: string
  byName: NameComparator
}

function excerptOf(line: string, at: number): string {
  if (line.length <= EXCERPT_MAX) return line

  const from = Math.max(at - EXCERPT_LEAD, LINE_START)
  const to = Math.min(from + EXCERPT_MAX, line.length)
  const opens = from === LINE_START ? '' : ELLIPSIS
  const closes = to === line.length ? '' : ELLIPSIS

  return `${opens}${line.slice(from, to)}${closes}`
}

function hitsIn(path: string, text: string, needle: string, room: number): SearchHit[] {
  const found: SearchHit[] = []
  let lineStart = LINE_START

  for (const [index, line] of text.split('\n').entries()) {
    for (const at of foldedMatchesIn(line, needle)) {
      if (found.length === room) return found

      found.push({ path, line: index + FIRST_LINE, offset: lineStart + at, excerpt: excerptOf(line, at) })
    }

    lineStart += line.length + NEWLINE
  }

  return found
}

export async function searchStore(store: Scannable, { query, byName }: SearchRequest): Promise<SearchOutcome> {
  const hits: SearchHit[] = []

  await serially(await store.list(byName), async (path: string) => {
    const room = MOST_HITS - hits.length
    if (room === NOTHING_LEFT) return

    const text = await store.read(path).catch(() => null)
    if (text === null) return

    hits.push(...hitsIn(path, text, query, room))
  })

  return { hits, capped: hits.length === MOST_HITS }
}

export const TestOnly = { MOST_HITS, EXCERPT_MAX, EXCERPT_LEAD }
