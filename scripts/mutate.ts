'use sanity'

import { execFile } from 'node:child_process'
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

async function run(command: string, args: string[], timeoutMs?: number): Promise<Ran> {
  const settled: PromiseWithResolvers<Ran> = Promise.withResolvers()

  execFile(command, args, { timeout: timeoutMs }, (error, stdout) => {
    const timedOut = error !== null && 'killed' in error && error.killed
    settled.resolve({ stdout, failed: error !== null, timedOut })
  })

  return await settled.promise
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

if (import.meta.main) {
  const survivors = await mutate(process.argv.slice(ARGUMENTS_START))
  process.exitCode = survivors > NONE ? FAILURE : SUCCESS
}
