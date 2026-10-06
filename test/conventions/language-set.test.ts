'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = path.join(import.meta.dirname, '..', '..')
const HIGHLIGHTER = 'src/client/highlight-code.ts'
const MAP_BLOCK = /const LANGUAGES[\s\S]*?\n\]\)/v
const MAP_KEY = /^\s*\['(?<name>[^']+)',/gmv
const DOCUMENTED_SET = /The\s+named\s+set\s+is(?<list>[\s\S]*?)—/v
const DOCUMENTED_NAME = /`(?<name>[a-z+]+)`/gv
const SOME_BREADTH = 10

function sorted(names: string[]): string[] {
  return [...names].sort((first, second) => first.localeCompare(second))
}

async function read(file: string): Promise<string> {
  return await fs.readFile(path.join(REPO_ROOT, file), 'utf8')
}

function shipped(source: string): string[] {
  const block = MAP_BLOCK.exec(source)?.[0] ?? ''

  return sorted([...block.matchAll(MAP_KEY)].map((match) => match.groups?.name ?? ''))
}

function documented(guide: string): string[] {
  const list = DOCUMENTED_SET.exec(guide)?.groups?.list ?? ''

  return sorted([...list.matchAll(DOCUMENTED_NAME)].map((match) => match.groups?.name ?? ''))
}

describe('the documented language set matches the one the highlighter ships', () => {
  it('documents every language a code fence can name', async () => {
    expect(documented(await read('DESIGN.md'))).toStrictEqual(shipped(await read(HIGHLIGHTER)))
  })

  it('found languages at all, so the comparison is not passing vacuously', async () => {
    expect(shipped(await read(HIGHLIGHTER)).length).toBeGreaterThan(SOME_BREADTH)
  })
})
