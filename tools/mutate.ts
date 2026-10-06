'use sanity'

import { spawn as spawnProcess } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'

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

const DEFAULT_TIMEOUT_MS = 120_000
const NONE = 0
const FIRST_LINE = 1
const ARGUMENTS_START = 2
const FAILURE = 1
const SUCCESS = 0
const FIRST_INDEX = 0
const VERDICT_WIDTH = 17
const CASE_FIELDS = ['label', 'file', 'from', 'to', 'project', 'spec', 'test']

interface Mutant {
  file: string
  line: number
  from: string
  to: string
  source: string
}

interface Outcome {
  mutant: Mutant
  survived: boolean
  timedOut: boolean
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

interface Sandbox {
  spawn: (command: string, args: string[], done: Finished) => Child
  kill: (pid: number, signal: NodeJS.Signals) => void
}

const OWN_PROCESS_GROUP = true
const HARD_KILL = 'SIGKILL'
const NO_OUTPUT = ''
const INTERRUPTS = ['SIGINT', 'SIGTERM'] as const

const liveGroups = new Set<number>()

const defaultSandbox: Sandbox = {
  spawn: (command, args, done) => {
    // Node's execFile signals only the direct child on timeout, and takes no
    // detached option -- so vitest and its forked workers outlive it.
    const child = spawnProcess(command, args, { detached: OWN_PROCESS_GROUP })
    let output = NO_OUTPUT

    child.stdout.on('data', (chunk: Buffer) => {
      output += chunk.toString()
    })
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

async function run(
  command: string,
  args: string[],
  timeoutMs?: number,
  sandbox: Sandbox = defaultSandbox,
): Promise<Ran> {
  const settled: PromiseWithResolvers<Ran> = Promise.withResolvers()
  const running: Child = {}

  const expiry =
    timeoutMs === undefined
      ? null
      : setTimeout(() => {
          endGroup(sandbox, running.pid)
          settled.resolve({ stdout: NO_OUTPUT, failed: true, timedOut: true })
        }, timeoutMs)

  const child = sandbox.spawn(command, args, (error, stdout) => {
    if (expiry !== null) clearTimeout(expiry)
    settled.resolve({ stdout, failed: error !== null, timedOut: false })
  })

  const { pid } = child
  running.pid = pid
  if (pid !== undefined) liveGroups.add(pid)

  try {
    return await settled.promise
  } finally {
    if (pid !== undefined) liveGroups.delete(pid)
  }
}

function skippable(line: string): boolean {
  const trimmed = line.trimStart()

  return trimmed === '' || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

function mutantsFor(file: string, contents: string): Mutant[] {
  const lines = contents.split('\n')

  return lines.flatMap((line, index) =>
    skippable(line)
      ? []
      : MUTATIONS.filter(([from]) => line.includes(from)).map(([from, to]) => ({
          file,
          line: index + FIRST_LINE,
          from,
          to,
          source: [...lines.slice(NONE, index), line.replace(from, to), ...lines.slice(index + FIRST_LINE)].join('\n'),
        })),
  )
}

async function workspaceState(): Promise<string> {
  const { stdout } = await run('git', ['status', '--porcelain'])

  return stdout
}

function describe({ file, line, from, to }: Mutant): string {
  return `${file}:${String(line)}  '${from}' -> '${to}'`
}

async function judge(mutant: Mutant, original: string, timeoutMs: number): Promise<Outcome> {
  try {
    await writeFile(mutant.file, mutant.source)
    const { failed, timedOut } = await run('npx', ['vitest', 'run', '--silent'], timeoutMs)

    return { mutant, survived: !failed, timedOut }
  } finally {
    await writeFile(mutant.file, original)
  }
}

function announce(outcome: Outcome, index: number, total: number): void {
  const mark = outcome.survived ? 'SURVIVED' : outcome.timedOut ? 'killed (timeout)' : 'killed'
  const position = `[${String(index + FIRST_LINE)}/${String(total)}]`

  process.stdout.write(`  ${position} ${mark}  ${describe(outcome.mutant)}\n`)
}

async function sweepFile(file: string, timeoutMs: number, into: Outcome[]): Promise<void> {
  const original = await readFile(file, 'utf8')
  const mutants = mutantsFor(file, original)
  const note = mutants.length === NONE ? ' — nothing to mutate, so this file was not measured' : ''
  process.stdout.write(`${file}: ${String(mutants.length)} mutants${note}\n`)

  await serially(mutants.entries(), async ([index, mutant]) => {
    const outcome = await judge(mutant, original, timeoutMs)
    into.push(outcome)
    announce(outcome, index, mutants.length)
  })
}

function reportOn(outcomes: Outcome[]): number {
  const survivors = outcomes.filter((outcome) => outcome.survived)
  process.stdout.write(`\n${String(survivors.length)} survived of ${String(outcomes.length)}\n`)
  for (const { mutant } of survivors) process.stdout.write(`  SURVIVED  ${describe(mutant)}\n`)

  return survivors.length
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

async function checkCase(item: Case, timeoutMs: number): Promise<Verdict> {
  const target = await readFile(item.file, 'utf8')
  if (!target.includes(item.from)) throw new Error(`${item.label}: '${item.from}' is not in ${item.file}`)

  try {
    await writeFile(item.file, target.replace(item.from, item.to))
    const { stdout, failed } = await run(
      'npx',
      ['vitest', 'run', '--project', item.project, item.spec, '-t', item.test],
      timeoutMs,
    )
    if (ranNothing(stdout)) return 'NO TESTS MATCHED'

    return failed ? 'CAUGHT' : 'STILL PASSES'
  } finally {
    await writeFile(item.file, target)
  }
}

export async function check(cases: Case[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<number> {
  if (cases.length === NONE) throw new Error('name at least one case to check')

  const entered = await workspaceState()
  const verdicts: Verdict[] = []
  try {
    await serially(cases, async (item) => {
      const verdict = await checkCase(item, timeoutMs)
      verdicts.push(verdict)
      process.stdout.write(`  ${verdict.padEnd(VERDICT_WIDTH)}${item.label}\n`)
    })
  } finally {
    const left = await workspaceState()
    if (left !== entered) process.stdout.write(`\nWORKSPACE CHANGED — restore by hand.\n${entered}\n${left}`)
  }

  return verdicts.filter((verdict) => verdict !== 'CAUGHT').length
}

export async function mutate(files: string[], timeoutMs = DEFAULT_TIMEOUT_MS): Promise<number> {
  if (files.length === NONE) throw new Error('name at least one file to mutate')

  const entered = await workspaceState()
  const outcomes: Outcome[] = []
  try {
    await serially(files, async (file) => {
      await sweepFile(file, timeoutMs, outcomes)
    })
  } finally {
    const left = await workspaceState()
    if (left !== entered) {
      process.stdout.write(`\nWORKSPACE CHANGED — restore by hand.\nentered:\n${entered}\nleft:\n${left}`)
    }
  }

  if (outcomes.length === NONE) throw new Error('no mutants were produced, so nothing was measured')

  return reportOn(outcomes)
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

export const TestOnly = { run }

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
