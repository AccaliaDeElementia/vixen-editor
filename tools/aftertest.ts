'use sanity'

import { readFile } from 'node:fs/promises'

import { describeMutant, judge, mutantsFor, run, type Mutant, type Outcome } from './mutate.ts'
import { runningInCI } from '../test/ci.ts'
import { serially } from '../src/shared/serially.ts'

const SOURCE_ROOT = 'src'
const SOURCE_EXTENSION = '.ts'
const JUDGEMENT_TIMEOUT_MS = 30_000
const SLOW_SWEEP_MS = 120_000
const MS_PER_SECOND = 1000

const NONE = 0
const ONE = 1
const FIRST_LINE = 1
const STATUS_WIDTH = 3
const RENAMED = ' -> '
const UNTRACKED = '??'
const NOT_RENAMED = null

const UNRESOLVED = 'unresolved'

const ALL_WELL = 0
const SURVIVOR_IN_WORK = 1

const HUNK = /^@@ -\S+ \+(?<start>\d+)(?:,(?<count>\d+))? @@/gmv

export interface InWork {
  file: string
  renamedFrom: string | null
  untracked: boolean
}

function pathIn(line: string): string {
  const named = line.slice(STATUS_WIDTH)
  const renamed = named.indexOf(RENAMED)

  return renamed < NONE ? named.trim() : named.slice(renamed + RENAMED.length).trim()
}

function renamedFromIn(line: string): string | null {
  const named = line.slice(STATUS_WIDTH)
  const renamed = named.indexOf(RENAMED)

  return renamed < NONE ? NOT_RENAMED : named.slice(NONE, renamed).trim()
}

export function filesFrom(porcelain: string): InWork[] {
  return porcelain
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => ({
      file: pathIn(line),
      renamedFrom: renamedFromIn(line),
      untracked: line.startsWith(UNTRACKED),
    }))
    .filter(({ file }) => file.startsWith(`${SOURCE_ROOT}/`) && file.endsWith(SOURCE_EXTENSION))
}

export function addedLinesIn(diff: string): Set<number> {
  const added = new Set<number>()

  for (const { groups } of diff.matchAll(HUNK)) {
    const start = Number(groups?.start)
    const count = groups?.count === undefined ? ONE : Number(groups.count)
    for (const line of Array.from({ length: count }, (_unused, offset) => start + offset)) added.add(line)
  }

  return added
}

function everyLineOf(source: string): Set<number> {
  return new Set(source.split('\n').map((_unused, index) => index + FIRST_LINE))
}

export function pathspecFor({ file, renamedFrom }: InWork): string[] {
  return renamedFrom === NOT_RENAMED ? [file] : [renamedFrom, file]
}

async function changedLinesIn(entry: InWork, source: string): Promise<Set<number>> {
  if (entry.untracked) return everyLineOf(source)

  const { stdout } = await run('git', ['diff', '--unified=0', 'HEAD', '--', ...pathspecFor(entry)])

  return addedLinesIn(stdout)
}

async function mutantsOnChangedLines(inWork: readonly InWork[]): Promise<Mutant[]> {
  const found: Mutant[] = []

  await serially(inWork, async (entry) => {
    const source = await readFile(entry.file, 'utf8').catch(() => null)
    if (source === null) return

    const changed = await changedLinesIn(entry, source)
    found.push(...mutantsFor(entry.file, source).filter(({ line }) => changed.has(line)))
  })

  return found
}

export function statusFor(survivors: readonly Mutant[]): number {
  return survivors.length === NONE ? ALL_WELL : SURVIVOR_IN_WORK
}

export function slownessWarning(elapsedMs: number, mutants: number, files: number): string | null {
  if (elapsedMs < SLOW_SWEEP_MS) return null
  const seconds = Math.round(elapsedMs / MS_PER_SECOND)

  return `  WARNING  ${String(seconds)}s to judge ${String(mutants)} mutants across ${String(files)} files\n`
}

export async function judgeInTurn(
  drawn: readonly Mutant[],
  tryOne: (mutant: Mutant) => Promise<Outcome>,
  say: (line: string) => void,
): Promise<Outcome[]> {
  const answers: Outcome[] = []

  await serially(drawn.entries(), async ([index, mutant]) => {
    say(`  [${String(index + ONE)}/${String(drawn.length)}] ${describeMutant(mutant)}\n`)
    answers.push(await tryOne(mutant))
  })

  return answers
}

export function findings(answers: readonly Outcome[]): Mutant[] {
  return answers
    .filter(({ fate, mutant }) => fate !== UNRESOLVED && fate !== mutant.expected)
    .map(({ mutant }) => mutant)
}

function report(answers: readonly Outcome[], elapsedMs: number, files: number): void {
  const found = findings(answers)
  const unresolved = answers.filter(({ fate }) => fate === UNRESOLVED)
  const ran = `${String(answers.length)} run, ${String(found.length)} to answer for`
  const timing = unresolved.length === NONE ? '' : `, ${String(unresolved.length)} out of time`
  process.stdout.write(`mutation sweep: ${ran}${timing}\n`)

  for (const { mutant } of unresolved) {
    process.stdout.write(`  out of time, so nothing was proved  ${describeMutant(mutant)}\n`)
  }
  for (const mutant of found) {
    process.stdout.write(`  SURVIVED its own test  ${describeMutant(mutant)}\n`)
  }

  const slow = slownessWarning(elapsedMs, answers.length, files)
  if (slow !== null) process.stdout.write(slow)
}

export async function sweepWorkInProgress(): Promise<number> {
  const inWork = filesFrom((await run('git', ['status', '--porcelain'])).stdout)
  const drawn = await mutantsOnChangedLines(inWork)
  if (drawn.length === NONE) return ALL_WELL

  process.stdout.write(`\nmutation sweep: ${String(drawn.length)} mutants on changed lines\n`)
  const started = performance.now()
  const answers = await judgeInTurn(
    drawn,
    async (mutant) => await judge(mutant, JUDGEMENT_TIMEOUT_MS),
    (line) => {
      process.stdout.write(line)
    },
  )
  report(answers, performance.now() - started, inWork.length)

  return statusFor(findings(answers))
}

if (import.meta.main && !runningInCI(process.env)) {
  process.exitCode = await sweepWorkInProgress()
}
