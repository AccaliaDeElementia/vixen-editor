'use sanity'

import { readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { describeMutant, sweep, type Outcome } from './mutate.ts'

const SOURCE_ROOT = 'src'
const SOURCE_EXTENSION = '.ts'
const CENSUS = '.vixen-census.md'
const DATE_ONLY = 10

const NONE = 0
const FAILURE = 1
const SUCCESS = 0

export function sourcesIn(root: string, entries: readonly string[]): string[] {
  return entries.filter((entry) => entry.endsWith(SOURCE_EXTENSION)).map((entry) => path.join(root, entry))
}

export function censusFrom(outcomes: readonly Outcome[], takenOn: string): string {
  const survivors = outcomes.filter(({ fate, mutant }) => fate !== mutant.expected)
  const headline = `${String(outcomes.length)} mutants judged against their own tests; ${String(survivors.length)} survived.`
  const listed =
    survivors.length === NONE
      ? 'Every mutant died where it lives — nothing survived.'
      : survivors.map(({ mutant }) => `- ${describeMutant(mutant)}`).join('\n')

  return `# Mutation census — ${takenOn}\n\n${headline}\n\n${listed}\n`
}

async function takeCensus(): Promise<number> {
  const entries = await readdir(SOURCE_ROOT, { recursive: true })
  const outcomes = await sweep(sourcesIn(SOURCE_ROOT, entries.map(String)))
  const takenOn = new Date().toISOString().slice(NONE, DATE_ONLY)
  const census = censusFrom(outcomes, takenOn)

  await writeFile(CENSUS, census)
  process.stdout.write(`\n${census}\nwritten to ${CENSUS}\n`)

  return outcomes.some(({ fate, mutant }) => fate !== mutant.expected) ? FAILURE : SUCCESS
}

if (import.meta.main) {
  process.exitCode = await takeCensus()
}
