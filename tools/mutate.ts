'use sanity'

import { spawn as spawnProcess } from 'node:child_process'
import { readFile } from 'node:fs/promises'

import { envFor } from './mutant-transform.ts'
import { serially } from '../src/shared/serially.ts'

const MUTATIONS: ReadonlyArray<readonly [string, string]> = [
  ['>=', '> '],
  ['<=', '< '],
  [' > ', ' >= '],
  [' < ', ' <= '],
  ['===', '!=='],
  ['!==', '==='],
  [' && ', ' || '],
  [' || ', ' && '],
  ['true', 'false'],
  ['false', 'true'],
]

const DEFAULT_TIMEOUT_MS = 600_000
const SOURCE_ROOT = 'src/'
const TEST_ROOT = 'test/'
const SOURCE_EXTENSION = '.ts'
const NOTHING_DROPPED = 0
const NONE = 0
const FIRST_LINE = 1
const ONE_MUTANT = 1
const KILLED: Fate = 'killed'
const ARGUMENTS_START = 2
const FAILURE = 1
const SUCCESS = 0
const FIRST_INDEX = 0
const VERDICT_WIDTH = 17
const CASE_FIELDS = ['label', 'file', 'from', 'to', 'project', 'spec', 'test']

export interface Mutant {
  file: string
  line: number
  from: string
  to: string
  expected: Fate
}

type Fate = 'killed' | 'survived' | 'unresolved'

const MARKS: Record<Fate, string> = { killed: 'killed', survived: 'SURVIVED', unresolved: 'UNRESOLVED' }

export interface Outcome {
  mutant: Mutant
  fate: Fate
}

interface Ran {
  stdout: string
  failed: boolean
  timedOut: boolean
}

type Finished = (error: Error | null, stdout: string) => void

interface Child {
  pid?: number | undefined
}

export interface Sandbox {
  spawn: (command: string, args: string[], done: Finished, env?: Record<string, string>) => Child
  kill: (pid: number, signal: NodeJS.Signals) => void
}

const OWN_PROCESS_GROUP = true
const HARD_KILL = 'SIGKILL'
const NO_OUTPUT = ''
const INTERRUPTS = ['SIGINT', 'SIGTERM'] as const

const liveGroups = new Set<number>()

const defaultSandbox: Sandbox = {
  spawn: (command, args, done, env) => {
    // Node's execFile signals only the direct child on timeout, and takes no
    // detached option -- so vitest and its forked workers outlive it.
    const child = spawnProcess(command, args, { detached: OWN_PROCESS_GROUP, env: { ...process.env, ...env } })
    let output = NO_OUTPUT

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
    child.stderr.resume()
    child.on('error', (error: Error) => {
      done(error, output)
    })
    child.on('close', (code: number | null) => {
      done(code === SUCCESS ? null : new Error(`${command} exited with ${String(code)}`), output)
    })

    return child
  },
  kill: (pid, signal) => {
    try {
      process.kill(pid, signal)
    } catch {
      process.stdout.write(`  could not signal process group ${String(pid)}\n`)
    }
  },
}

function groupOf(pid: number): number {
  return -pid
}

function endGroup(sandbox: Sandbox, pid: number | undefined): void {
  if (pid === undefined) return

  liveGroups.delete(pid)
  sandbox.kill(groupOf(pid), HARD_KILL)
}

function endEveryLiveGroup(): void {
  for (const pid of liveGroups) endGroup(defaultSandbox, pid)
}

interface Spawning {
  sandbox?: Sandbox
  env?: Record<string, string>
}

export async function run(command: string, args: string[], timeoutMs?: number, spawning: Spawning = {}): Promise<Ran> {
  const { sandbox = defaultSandbox, env } = spawning
  const settled: PromiseWithResolvers<Ran> = Promise.withResolvers()
  const running: Child = {}

  const expiry =
    timeoutMs === undefined
      ? null
      : setTimeout(() => {
          endGroup(sandbox, running.pid)
          settled.resolve({ stdout: NO_OUTPUT, failed: true, timedOut: true })
        }, timeoutMs)

  const child = sandbox.spawn(
    command,
    args,
    (error, stdout) => {
      if (expiry !== null) clearTimeout(expiry)
      settled.resolve({ stdout, failed: error !== null, timedOut: false })
    },
    env,
  )

  const { pid } = child
  running.pid = pid
  if (pid !== undefined) liveGroups.add(pid)

  try {
    return await settled.promise
  } finally {
    if (pid !== undefined) liveGroups.delete(pid)
  }
}

const OPENS_BLOCK = '/*'
const CLOSES_BLOCK = '*/'

function startsComment(line: string): boolean {
  const trimmed = line.trimStart()

  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith(OPENS_BLOCK)
}

// A block comment's later lines carry no marker of their own, so a line-by-line
// reading takes them for code and mutates the prose.
function codeLines(lines: readonly string[]): boolean[] {
  let inBlock = false

  return lines.map((line) => {
    const wasInBlock = inBlock
    if (inBlock) inBlock = !line.includes(CLOSES_BLOCK)
    else inBlock = line.trimStart().startsWith(OPENS_BLOCK) && !line.includes(CLOSES_BLOCK)

    return !wasInBlock && !inBlock && line.trim() !== '' && !startsComment(line)
  })
}

const DECLARES_TYPE = /^(?:export\s+)?type\s+\w/v
const OPENS_A_GROUP = '({['
const CLOSES_A_GROUP = ')}]'
const TRAILS_INTO_NEXT_LINE = '=|&,({['
const LEADS_FROM_PREVIOUS_LINE = '|&'
const BALANCED = 0
const NO_SUCH_LINE = ''
const THE_LINE_AFTER = 1
const LAST_CHARACTER = -1
const FIRST_CHARACTER = 0

function countIn(line: string, characters: string): number {
  return Array.from(line).filter((character) => characters.includes(character)).length
}

function isOneOf(character: string | undefined, characters: string): boolean {
  return character !== undefined && characters.includes(character)
}

function groupDepthChange(line: string): number {
  return countIn(line, OPENS_A_GROUP) - countIn(line, CLOSES_A_GROUP)
}

function typeDeclarationLines(lines: readonly string[]): boolean[] {
  let depth = BALANCED
  let declaring = false

  return lines.map((line, index) => {
    const trimmed = line.trim()
    if (!declaring) {
      if (!DECLARES_TYPE.test(trimmed)) return false
      declaring = true
      depth = BALANCED
    }

    depth += groupDepthChange(line)
    const next = lines[index + THE_LINE_AFTER]?.trim() ?? NO_SUCH_LINE
    const unfinished =
      depth !== BALANCED ||
      isOneOf(trimmed.at(LAST_CHARACTER), TRAILS_INTO_NEXT_LINE) ||
      isOneOf(next.at(FIRST_CHARACTER), LEADS_FROM_PREVIOUS_LINE)
    if (!unfinished) declaring = false

    return true
  })
}

const EXPECTED_TO_SURVIVE = /mutation-ignore\s+(?<to>\S+)\s+--/v
const NO_PREVIOUS_LINE = ''

function claimedAbove(lines: readonly string[], isCode: readonly boolean[], index: number): string | null {
  for (let above = index - ONE_MUTANT; above >= NONE && isCode[above] === false; above -= ONE_MUTANT) {
    const named = EXPECTED_TO_SURVIVE.exec(lines[above] ?? NO_PREVIOUS_LINE)?.groups?.to
    if (named !== undefined) return named
  }

  return null
}

function asClaimed(found: Mutant[], claim: string, where: string): Mutant[] {
  const [only] = found
  if (found.length !== ONE_MUTANT || only === undefined) {
    throw new Error(`${where}: a mutation-ignore needs a line carrying one mutable operation, not ${found.length}`)
  }
  if (only.to.trim() !== claim) {
    throw new Error(`${where}: a mutation-ignore names '${claim}', which that line does not make`)
  }

  return [{ ...only, expected: 'survived' }]
}

export function mutantsFor(file: string, contents: string): Mutant[] {
  const lines = contents.split('\n')
  const isCode = codeLines(lines)
  const isType = typeDeclarationLines(lines)

  return lines.flatMap((line, index) => {
    if (isCode[index] !== true) return []

    const mutable = isType[index] === true ? [] : MUTATIONS.filter(([from]) => line.includes(from))
    const found = mutable.map(([from, to]) => ({
      file,
      line: index + FIRST_LINE,
      from,
      to,
      expected: KILLED,
    }))
    const claim = claimedAbove(lines, isCode, index)

    return claim === null ? found : asClaimed(found, claim, `${file}:${String(index + FIRST_LINE)}`)
  })
}

export function describeMutant({ file, line, from, to }: Mutant): string {
  return `${file}:${String(line)}  '${from}' -> '${to}'`
}

function mirrorArgsFor(mutant: Mutant): string[] {
  const named = mutant.file.replace(SOURCE_ROOT, TEST_ROOT).slice(NOTHING_DROPPED, -SOURCE_EXTENSION.length)

  return ['vitest', 'run', named, '--silent', '--bail=1', '--passWithNoTests']
}

export async function judge(
  mutant: Mutant,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  spawning: Spawning = {},
): Promise<Outcome> {
  const settings = { ...spawning, env: envFor(mutant) }

  return { mutant, fate: fateOf(await run('npx', mirrorArgsFor(mutant), timeoutMs, settings)) }
}

function fateOf({ failed, timedOut }: Ran): Fate {
  if (timedOut) return 'unresolved'

  return failed ? 'killed' : 'survived'
}

function markFor({ mutant, fate }: Outcome): string {
  if (fate === mutant.expected) return fate === 'killed' ? MARKS.killed : 'survived as claimed'

  return fate === 'killed' ? 'EXPIRED' : MARKS[fate]
}

function announce(outcome: Outcome, index: number, total: number): void {
  const position = `[${String(index + FIRST_LINE)}/${String(total)}]`

  process.stdout.write(`  ${position} ${markFor(outcome)}  ${describeMutant(outcome.mutant)}\n`)
}

async function sweepFile(file: string, timeoutMs: number, into: Outcome[]): Promise<void> {
  const original = await readFile(file, 'utf8')
  const mutants = mutantsFor(file, original)
  const note = mutants.length === NONE ? ' — nothing to mutate, so this file was not measured' : ''
  process.stdout.write(`${file}: ${String(mutants.length)} mutants${note}\n`)

  await serially(mutants.entries(), async ([index, mutant]) => {
    const outcome = await judge(mutant, timeoutMs)
    into.push(outcome)
    announce(outcome, index, mutants.length)
  })
}

function linesFor(label: string, mark: string, held: readonly Outcome[], total: number): string[] {
  return [
    `${String(held.length)} ${label} of ${String(total)}`,
    ...held.map(({ mutant }) => `  ${mark}  ${describeMutant(mutant)}`),
  ]
}

function whose(outcomes: readonly Outcome[], fate: Fate, expected: Fate): Outcome[] {
  return outcomes.filter((outcome) => outcome.fate === fate && outcome.mutant.expected === expected)
}

function summaryOf(outcomes: readonly Outcome[]): string[] {
  const unresolved = outcomes.filter((outcome) => outcome.fate === 'unresolved')
  const expired = whose(outcomes, 'killed', 'survived')

  return [
    ...linesFor('survived', MARKS.survived, whose(outcomes, 'survived', 'killed'), outcomes.length),
    ...(unresolved.length === NONE ? [] : linesFor('unresolved', MARKS.unresolved, unresolved, outcomes.length)),
    ...(expired.length === NONE ? [] : linesFor('expired', 'EXPIRED', expired, outcomes.length)),
  ]
}

function reportOn(outcomes: Outcome[]): number {
  process.stdout.write(`\n${summaryOf(outcomes).join('\n')}\n`)

  return outcomes.filter((outcome) => outcome.fate !== outcome.mutant.expected).length
}

interface Case {
  label: string
  file: string
  from: string
  to: string
  project: string
  spec: string
  test: string
}

type Verdict = 'CAUGHT' | 'STILL PASSES' | 'NO TESTS MATCHED'

function ranNothing(output: string): boolean {
  const summary = /Tests\s+(?<detail>[^\n]*)/v.exec(output)?.groups?.detail
  if (summary === undefined) return true

  const counted = [...summary.matchAll(/(?<count>\d+)\s+(?:failed|passed)/gv)]

  return counted.reduce((total, match) => total + Number(match.groups?.count ?? NONE), NONE) === NONE
}

function lineHolding(source: string, from: string): number {
  return source.split('\n').findIndex((line) => line.includes(from)) + FIRST_LINE
}

async function checkCase(item: Case, timeoutMs: number): Promise<Verdict> {
  const target = await readFile(item.file, 'utf8')
  if (!target.includes(item.from)) throw new Error(`${item.label}: '${item.from}' is not in ${item.file}`)

  const mutation = { file: item.file, line: lineHolding(target, item.from), from: item.from, to: item.to }
  const { stdout, failed } = await run(
    'npx',
    ['vitest', 'run', '--project', item.project, item.spec, '-t', item.test],
    timeoutMs,
    { env: envFor(mutation) },
  )
  if (ranNothing(stdout)) return 'NO TESTS MATCHED'

  return failed ? 'CAUGHT' : 'STILL PASSES'
}

export async function check(cases: Case[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<number> {
  if (cases.length === NONE) throw new Error('name at least one case to check')

  const verdicts: Verdict[] = []
  await serially(cases, async (item) => {
    const verdict = await checkCase(item, timeoutMs)
    verdicts.push(verdict)
    process.stdout.write(`  ${verdict.padEnd(VERDICT_WIDTH)}${item.label}\n`)
  })

  return verdicts.filter((verdict) => verdict !== 'CAUGHT').length
}

export async function sweep(files: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<Outcome[]> {
  if (files.length === NONE) throw new Error('name at least one file to mutate')

  const outcomes: Outcome[] = []
  await serially(files, async (file) => {
    await sweepFile(file, timeoutMs, outcomes)
  })

  if (outcomes.length === NONE) throw new Error('no mutants were produced, so nothing was measured')

  return outcomes
}

export async function mutate(files: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<number> {
  return reportOn(await sweep(files, timeoutMs))
}

function isCase(value: unknown): value is Case {
  if (typeof value !== 'object' || value === null) return false

  return CASE_FIELDS.every((field) => typeof Reflect.get(value, field) === 'string')
}

async function casesFrom(path: string): Promise<Case[]> {
  const parsed: unknown = JSON.parse(await readFile(path, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error(`${path} must hold an array of cases`)

  const cases = parsed.filter(isCase)
  if (cases.length !== parsed.length) throw new Error(`${path} holds an entry missing one of ${CASE_FIELDS.join(', ')}`)

  return cases
}

export const TestOnly = { fateOf, lineHolding, mirrorArgsFor, summaryOf }

if (import.meta.main) {
  for (const interrupt of INTERRUPTS) {
    process.once(interrupt, () => {
      endEveryLiveGroup()
      process.kill(process.pid, interrupt)
    })
  }

  const [first, ...rest] = process.argv.slice(ARGUMENTS_START)
  const unmet =
    first === '--cases' ? await check(await casesFrom(rest[FIRST_INDEX] ?? '')) : await mutate([first ?? '', ...rest])
  process.exitCode = unmet > NONE ? FAILURE : SUCCESS
}
