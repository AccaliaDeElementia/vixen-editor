'use sanity'

import { execFile } from 'node:child_process'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const SUITES = ['test', 'test-browser']
const BROWSER_SUITE = 'test-browser'
const SOURCE = '.ts'
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
  assertions: number | null
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

    return [
      {
        file,
        line: text.slice(NONE, match.index).split('\n').length,
        name: match.groups?.name ?? '',
        assertions: body === null ? null : [...withoutConditions(body).matchAll(ASSERTION)].length,
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

      return entry.name.endsWith(SOURCE) ? [full] : []
    }),
  )

  return nested.flat()
}

export async function countAll(): Promise<Counted[]> {
  const found = await Promise.all(SUITES.map(specsUnder))
  const counted = await Promise.all(found.flat().map(async (file) => countIn(file, await readFile(file, 'utf8'))))

  return counted.flat()
}

const PROJECT_TAG = /^\[[^\]]+\]\s*(?:\u203a\s*)?/v
const VITEST_PATH_ENDS = ' > '

interface Lister {
  what: string
  command: string
  args: string[]
  listsEveryProject: boolean
  fileOf: (declaration: string) => string | null
}

function vitestFileOf(declaration: string): string | null {
  const ends = declaration.indexOf(VITEST_PATH_ENDS)

  return ends < NONE ? null : declaration.slice(NONE, ends)
}

function playwrightFileOf(declaration: string): string | null {
  const ends = declaration.indexOf(':')

  return ends < NONE ? null : path.join(BROWSER_SUITE, declaration.slice(NONE, ends))
}

const LISTERS: Lister[] = [
  { what: 'vitest', command: 'npx', args: ['vitest', 'list'], listsEveryProject: false, fileOf: vitestFileOf },
  {
    what: 'playwright',
    command: 'npx',
    args: ['playwright', 'test', '-c', 'test-browser/playwright.config.ts', '--list'],
    listsEveryProject: true,
    fileOf: playwrightFileOf,
  },
]

async function listing(lister: Lister): Promise<string> {
  const settled: PromiseWithResolvers<string> = Promise.withResolvers()

  execFile(lister.command, lister.args, (error, stdout) => {
    if (error === null) settled.resolve(stdout)
    else settled.reject(new Error(`${lister.what} could not list its tests: ${error.message}`))
  })

  return await settled.promise
}

function declarationsIn(lister: Lister, stdout: string): string[] {
  const tagged = stdout.split('\n').map((line) => line.trimStart())
  const listed = tagged.filter((line) => PROJECT_TAG.test(line)).map((line) => line.replace(PROJECT_TAG, ''))

  return lister.listsEveryProject ? [...new Set(listed)] : listed
}

function tally(files: string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const file of files) counts.set(file, (counts.get(file) ?? NONE) + ONE)

  return counts
}

async function countedByRunners(): Promise<Map<string, number>> {
  const listings = await Promise.all(
    LISTERS.map(async (lister) => {
      const declarations = declarationsIn(lister, await listing(lister))

      return declarations.map((declaration) => lister.fileOf(declaration)).filter((file) => file !== null)
    }),
  )

  return tally(listings.flat())
}

interface Disagreement {
  file: string
  scanned: number
  listed: number
}

function disagreements(scanned: Counted[], listed: Map<string, number>): Disagreement[] {
  const mine = tally(scanned.map(({ file }) => file))
  const everyFile = new Set([...mine.keys(), ...listed.keys()])

  return [...everyFile]
    .map((file) => ({ file, scanned: mine.get(file) ?? NONE, listed: listed.get(file) ?? NONE }))
    .filter((row) => row.scanned !== row.listed)
    .sort((a, b) => a.file.localeCompare(b.file))
}

if (import.meta.main) {
  const counted = await countAll()
  const over = counted.filter(({ assertions }) => assertions !== null && assertions > ONE)
  const readable = counted.filter(({ assertions }) => assertions !== null)
  const tally = new Map<number, number>()
  for (const { assertions } of readable) tally.set(assertions ?? NONE, (tally.get(assertions ?? NONE) ?? NONE) + ONE)

  process.stdout.write(`${String(counted.length)} tests\n`)
  for (const key of [...tally.keys()].sort((a, b) => a - b)) {
    process.stdout.write(`  ${String(key)} assertion(s): ${String(tally.get(key) ?? NONE)}\n`)
  }
  const silent = counted.filter(({ assertions }) => assertions === NONE)
  const unread = counted.length - readable.length
  if (unread > NONE) process.stdout.write(`  (${String(unread)} pass a named function, so their body is elsewhere)\n`)
  if (silent.length > NONE) {
    process.stdout.write(`\n${String(silent.length)} tests assert nothing outside a wait\n`)
    for (const { file, line, name } of silent) process.stdout.write(`  ${file}:${String(line)}  ${name}\n`)
  }

  process.stdout.write(`\n${String(over.length)} tests assert more than once\n`)
  for (const { file, line, name, assertions } of over) {
    process.stdout.write(`  ${String(assertions)}  ${file}:${String(line)}  ${name}\n`)
  }

  const missed = disagreements(counted, await countedByRunners())
  if (missed.length > NONE) {
    process.stdout.write(`\n${String(missed.length)} files this scanner reads differently from the runners\n`)
    for (const { file, scanned, listed } of missed) {
      process.stdout.write(`  ${file}: scanned ${String(scanned)}, listed ${String(listed)}\n`)
    }
  }

  process.exitCode = over.length + missed.length > NONE ? FAILURE : SUCCESS
}
