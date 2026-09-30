'use sanity'

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const SUITES = ['test', 'test-browser']
const SUFFIXES = ['.test.ts', '.spec.ts']
const CONDITIONS = ['given', 'givenAsync']

const NONE = 0
const ONE = 1
const AFTER_MATCH = 2
const FAILURE = 1
const SUCCESS = 0

const TEST_START =
  /\b(?:it|test)(?:\.each(?:<[^>]*>)?\((?:.|\n)*?\)\s*)?\(\s*(?<quote>[`'"])(?<name>(?:(?!\k<quote>).)*)\k<quote>/gv
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

const BEFORE_A_REGEX = new Set(['(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '\n'])
const INSIGNIFICANT = new Set([' ', '\t'])

interface Scan {
  depth: number
  quote: string | null
  escaped: boolean
  inRegex: boolean
  previous: string
  closedAt: number | null
}

function remembering(scan: Scan, character: string): string {
  return INSIGNIFICANT.has(character) ? scan.previous : character
}

function opensARegex(scan: Scan, character: string, next: string): boolean {
  return character === '/' && next !== '/' && next !== '*' && BEFORE_A_REGEX.has(scan.previous)
}

function advance(scan: Scan, character: string, next: string, index: number): Scan {
  const previous = remembering(scan, character)
  if (scan.escaped) return { ...scan, escaped: false, previous }
  if (scan.inRegex) {
    return { ...scan, escaped: character === '\\', inRegex: character !== '/', previous }
  }
  if (scan.quote !== null) {
    return { ...scan, escaped: character === '\\', quote: quoteAfter(character, scan.quote), previous }
  }
  if (opensARegex(scan, character, next)) return { ...scan, inRegex: true, previous }
  if (QUOTES.has(character)) return { ...scan, quote: character, previous }
  if (OPENERS.has(character)) return { ...scan, depth: scan.depth + ONE, previous }
  if (!CLOSERS.has(character)) return { ...scan, previous }

  const depth = scan.depth - ONE

  return { ...scan, depth, previous, closedAt: depth === NONE ? index : null }
}

function spanFrom(text: string, open: number): string {
  let scan: Scan = { depth: NONE, quote: null, escaped: false, inRegex: false, previous: '(', closedAt: null }

  for (let index = open; index < text.length; index += ONE) {
    scan = advance(scan, text[index] ?? '', text[index + ONE] ?? '', index)
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

const QUOTE_PAIR = 2

function callOpenedAt(text: string, match: RegExpExecArray): number | null {
  const name = match.groups?.name ?? ''
  const nameOpensAt = match.index + match[NONE].length - name.length - QUOTE_PAIR
  const open = text.lastIndexOf('(', nameOpensAt)

  return open < NONE ? null : open
}

function bodyOf(text: string, match: RegExpExecArray): string | null {
  const open = callOpenedAt(text, match)
  if (open === null) return null

  const call = spanFrom(text, open)
  const arrow = call.indexOf('=>')

  return arrow < NONE ? null : call.slice(arrow + AFTER_MATCH)
}

export function countIn(file: string, text: string): Counted[] {
  const starts = [...text.matchAll(TEST_START)]

  return starts.flatMap((match) => {
    const body = bodyOf(text, match)
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
  const silent = counted.filter(({ assertions }) => assertions === NONE)
  if (silent.length > NONE) {
    process.stdout.write(`\n${String(silent.length)} tests assert nothing outside a wait\n`)
    for (const { file, line, name } of silent) process.stdout.write(`  ${file}:${String(line)}  ${name}\n`)
  }

  process.stdout.write(`\n${String(over.length)} tests assert more than once\n`)
  for (const { file, line, name, assertions } of over) {
    process.stdout.write(`  ${String(assertions)}  ${file}:${String(line)}  ${name}\n`)
  }

  process.exitCode = over.length > NONE ? FAILURE : SUCCESS
}
