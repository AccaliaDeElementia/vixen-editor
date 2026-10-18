'use sanity'

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { describeMutant, judge, mutantsFor, run, type Mutant } from './mutate.ts'
import { runningInCI } from '../test/ci.ts'
import { serially } from '../src/shared/serially.ts'

const SOURCE_ROOT = 'src'
const SOURCE_EXTENSION = '.ts'
const BUDGET = 8
const REMEMBERED = 200
const RECORD = '.vixen-mutants.json'
const TIMEOUT_MS = 120_000

const NONE = 0
const ONE = 1
const START = 0
const STATUS_WIDTH = 3
const RENAMED = ' -> '

const ALL_WELL = 0
const SURVIVOR_IN_WORK = 1
const SURVIVOR_ELSEWHERE = 5

type Pick<T> = (items: readonly T[], count: number) => T[]

export function keyOf({ file, line, from, to }: Mutant): string {
  return `${file}:${String(line)}:${from}>${to}`
}

export function eligible(pool: readonly Mutant[], recently: readonly string[]): Mutant[] {
  const seen = new Set(recently)

  return pool.filter((mutant) => !seen.has(keyOf(mutant)))
}

export function sample<T>(inWork: readonly T[], elsewhere: readonly T[], budget: number, pick: Pick<T>): T[] {
  const spare = pick(elsewhere, Math.max(ONE, budget - inWork.length))

  return [...pick(inWork, budget - spare.length), ...spare]
}

export function statusFor(survivors: readonly Mutant[], inWork: readonly string[]): number {
  if (survivors.length === NONE) return ALL_WELL
  const touched = new Set(inWork)

  return survivors.some((mutant) => touched.has(mutant.file)) ? SURVIVOR_IN_WORK : SURVIVOR_ELSEWHERE
}

function randomly<T>(items: readonly T[], count: number): T[] {
  const pool = [...items]
  const taken: T[] = []

  while (taken.length < count && pool.length > NONE) {
    const [picked] = pool.splice(Math.floor(Math.random() * pool.length), ONE)
    if (picked !== undefined) taken.push(picked)
  }

  return taken
}

function pathIn(line: string): string {
  const named = line.slice(STATUS_WIDTH)
  const renamed = named.indexOf(RENAMED)

  return renamed < START ? named.trim() : named.slice(renamed + RENAMED.length).trim()
}

async function filesInWork(): Promise<string[]> {
  const { stdout } = await run('git', ['status', '--porcelain'])

  return stdout
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map(pathIn)
    .filter((named) => named.startsWith(`${SOURCE_ROOT}/`) && named.endsWith(SOURCE_EXTENSION))
}

async function everyMutant(): Promise<Mutant[]> {
  const named = await readdir(SOURCE_ROOT, { recursive: true })
  const sources = named.map((entry) => path.join(SOURCE_ROOT, entry)).filter((file) => file.endsWith(SOURCE_EXTENSION))
  const found = await Promise.all(sources.map(async (file) => mutantsFor(file, await readFile(file, 'utf8'))))

  return found.flat()
}

async function rememberedKeys(): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await readFile(RECORD, 'utf8'))

    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === 'string') : []
  } catch {
    return []
  }
}

async function remember(drawn: readonly Mutant[], previous: readonly string[]): Promise<void> {
  const keys = [...drawn.map(keyOf), ...previous].slice(START, REMEMBERED)

  await writeFile(RECORD, JSON.stringify(keys))
}

function report(survivors: readonly Mutant[], drawn: readonly Mutant[], inWork: readonly string[]): void {
  process.stdout.write(`\nmutation sample: ${String(drawn.length)} run, ${String(survivors.length)} survived\n`)
  const touched = new Set(inWork)
  for (const mutant of survivors) {
    const where = touched.has(mutant.file) ? 'in work in progress' : 'elsewhere'
    process.stdout.write(`  WARNING  survived ${where}  ${describeMutant(mutant)}\n`)
  }
  if (survivors.length > NONE) process.stdout.write('  raise a task to investigate after the current commit\n')
}

export async function sampleMutants(): Promise<number> {
  const inWork = await filesInWork()
  const touched = new Set(inWork)
  const open = eligible(await everyMutant(), await rememberedKeys())
  const drawn = sample(
    open.filter((mutant) => touched.has(mutant.file)),
    open.filter((mutant) => !touched.has(mutant.file)),
    BUDGET,
    randomly,
  )

  const survivors: Mutant[] = []
  await serially(drawn, async (mutant) => {
    const outcome = await judge(mutant, TIMEOUT_MS)
    if (outcome.fate !== mutant.expected) survivors.push(mutant)
  })

  await remember(drawn, await rememberedKeys())
  report(survivors, drawn, inWork)

  return statusFor(survivors, inWork)
}

if (import.meta.main && !runningInCI(process.env)) {
  process.exitCode = await sampleMutants()
}
