'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const CLIENT = 'src/client'
const HELP_REGISTRY = 'src/client/help.ts'
const SOURCE_EXTENSION = '.ts'

const KEY_BINDING = /\bkey\s*(?::|===)\s*(?<bound>'[^']*'|"[^"]*"|\w+)/gv
const REGISTRY_IMPORT = /^import\s+\{(?<names>[^\}]*)\}\s*from\s*'[^']*\/help\.ts'/gmv

const KEY_ANNOTATION = 'string'

interface SourceFile {
  relativePath: string
  contents: string
}

let bindingSites: SourceFile[] = []

async function collect(directory: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(REPO_ROOT, directory), { withFileTypes: true })

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = `${directory}/${entry.name}`
      if (entry.isDirectory()) return await collect(relativePath)

      return entry.name.endsWith(SOURCE_EXTENSION) ? [relativePath] : []
    }),
  )

  return nested.flat()
}

function registryNamesIn(contents: string): Set<string> {
  return new Set(
    [...contents.matchAll(REGISTRY_IMPORT)].flatMap((match) =>
      (match.groups?.names ?? '').split(',').map((name) => name.trim()),
    ),
  )
}

function boundOutsideRegistry({ relativePath, contents }: SourceFile): string[] {
  const registered = registryNamesIn(contents)

  return contents.split('\n').flatMap((line, index) => {
    const offending = [...line.matchAll(KEY_BINDING)]
      .map((match) => match.groups?.bound ?? '')
      .filter((bound) => bound !== KEY_ANNOTATION && !registered.has(bound))

    return offending.length === 0 ? [] : [`${relativePath}:${String(index + 1)} ${offending.join(' ')}`]
  })
}

beforeAll(async () => {
  const paths = (await collect(CLIENT)).filter((relativePath) => relativePath !== HELP_REGISTRY).sort()

  bindingSites = await Promise.all(
    paths.map(async (relativePath) => ({
      relativePath,
      contents: await fs.readFile(path.join(REPO_ROOT, relativePath), 'utf8'),
    })),
  )
})

describe('every keyboard binding names its key through the help registry', () => {
  it('leaves no key at a binding site that the help list does not hold', () => {
    expect(bindingSites.flatMap(boundOutsideRegistry)).toStrictEqual([])
  })

  it('finds the bindings that do exist, so the scan is not silently matching nothing', () => {
    const binding = bindingSites.filter((source) => KEY_BINDING.test(source.contents))

    expect(binding.length).toBeGreaterThan(0)
  })
})
