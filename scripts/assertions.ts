'use sanity'

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const SUITES = ['test', 'test-browser']
const SUFFIXES = ['.test.ts', '.spec.ts']
const CONDITIONS = ['given', 'waitUntil']

const NONE = 0
const ONE = 1
const AFTER_MATCH = 2
const FAILURE = 1
const SUCCESS = 0

const TEST_START =
  /\b(?:it|test)(?:\.each\((?:.|\n)*?\)\s*)?\(\s*(?<quote>[`'"])(?<name>(?:(?!\k<quote>).)*)\k<quote>/gv
const ASSERTION = /\bexpect(?:\.poll)?\s*\(/gv

export interface Counted {
  file: string
  line: number
  name: string
  assertions: number
}

const QUOTES = new Set(["'", '"', '`'])
const OPENERS = new Set(['(', '{'])
const CLOSERS = new Set([')', '}'])

function quoteAfter(character: string, quote: string | null): string | null {
  if (quote === null) return QUOTES.has(character) ? character : null

  return character === quote ? null : quote
}

interface Scan {
  depth: number
  quote: string | null
  escaped: boolean
  closedAt: number | null
}

function advance(scan: Scan, character: string, index: number): Scan {
  if (scan.escaped) return { ...scan, escaped: false }
  if (scan.quote !== null) {
    return { ...scan, escaped: character === '\\', quote: quoteAfter(character, scan.quote) }
  }
  if (QUOTES.has(character)) return { ...scan, quote: character }
  if (OPENERS.has(character)) return { ...scan, depth: scan.depth + ONE }
  if (!CLOSERS.has(character)) return scan

  const depth = scan.depth - ONE

  return { ...scan, depth, closedAt: depth === NONE ? index : null }
}

function spanFrom(text: string, open: number): string {
  let scan: Scan = { depth: NONE, quote: null, escaped: false, closedAt: null }

  for (let index = open; index < text.length; index += ONE) {
    scan = advance(scan, text[index] ?? '', index)
    if (scan.closedAt !== null) return text.slice(open, scan.closedAt + ONE)
  }

  return text.slice(open)
}

function withoutConditions(body: string): string {
  return CONDITIONS.reduce((stripped, name) => {
    let result = stripped
    for (;;) {
      const at = result.indexOf(`${name}(`)
      if (at < NONE) return result
      const span = spanFrom(result, at + name.length)
      result = result.slice(NONE, at) + result.slice(at + name.length + span.length)
    }
  }, body)
}

function bodyBetween(text: string, after: number, until: number): string | null {
  const arrow = text.indexOf('=>', after)
  if (arrow < NONE || arrow > until) return null

  return text.slice(arrow + AFTER_MATCH, until)
}

export function countIn(file: string, text: string): Counted[] {
  const starts = [...text.matchAll(TEST_START)]

  return starts.flatMap((match, position) => {
    const until = starts[position + ONE]?.index ?? text.length
    const body = bodyBetween(text, match.index + match[NONE].length, until)
    if (body === null) return []

    return [
      {
        file,
        line: text.slice(NONE, match.index).split('\n').length,
        name: match.groups?.name ?? '',
        assertions: [...withoutConditions(body).matchAll(ASSERTION)].length,
      },
    ]
  })
}

async function specsUnder(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = path.join(directory, entry.name)
      if (entry.isDirectory()) return await specsUnder(full)

      return SUFFIXES.some((suffix) => entry.name.endsWith(suffix)) ? [full] : []
    }),
  )

  return nested.flat()
}

export async function countAll(): Promise<Counted[]> {
  const found = await Promise.all(SUITES.map(specsUnder))
  const counted = await Promise.all(found.flat().map(async (file) => countIn(file, await readFile(file, 'utf8'))))

  return counted.flat()
}

if (import.meta.main) {
  const counted = await countAll()
  const over = counted.filter(({ assertions }) => assertions > ONE)
  const tally = new Map<number, number>()
  for (const { assertions } of counted) tally.set(assertions, (tally.get(assertions) ?? NONE) + ONE)

  process.stdout.write(`${String(counted.length)} tests\n`)
  for (const key of [...tally.keys()].sort((a, b) => a - b)) {
    process.stdout.write(`  ${String(key)} assertion(s): ${String(tally.get(key) ?? NONE)}\n`)
  }
  process.stdout.write(`\n${String(over.length)} tests assert more than once\n`)
  for (const { file, line, name, assertions } of over) {
    process.stdout.write(`  ${String(assertions)}  ${file}:${String(line)}  ${name}\n`)
  }

  process.exitCode = over.length > NONE ? FAILURE : SUCCESS
}
