'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const SOURCE_DIRECTORIES = ['server', 'client', 'scripts', 'test', 'test-browser']
const ROOT_SOURCE_FILES = ['index.ts', 'vitest.config.ts', 'eslint.config.js']
const SOURCE_EXTENSION = /\.(?:ts|js)$/u

const DIRECTIVE = "'use sanity'"
const DEFAULT_EXPORT_ALLOWLIST = ['eslint.config.js', 'test-browser/playwright.config.ts', 'vitest.config.ts']

const SCANNER = 'test/conventions/project-rules.test.ts'

const SUPPRESSION = /eslint-disable|v8 ignore/u
const CLOSES_COVERAGE_REGION = /v8 ignore (?:stop|end)/u
const RATIONALE = /--\s*\S/u

interface SourceFile {
  relativePath: string
  contents: string
}

let sources: SourceFile[]

async function collect(directory: string): Promise<string[]> {
  const entries = await fs.readdir(path.join(REPO_ROOT, directory), { withFileTypes: true })

  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relativePath = `${directory}/${entry.name}`
      if (entry.isDirectory()) return await collect(relativePath)
      return SOURCE_EXTENSION.test(entry.name) ? [relativePath] : []
    }),
  )

  return nested.flat()
}

function scannable(): SourceFile[] {
  return sources.filter((source) => source.relativePath !== SCANNER)
}

beforeAll(async () => {
  const discovered = await Promise.all(SOURCE_DIRECTORIES.map(collect))
  const paths = [...ROOT_SOURCE_FILES, ...discovered.flat()].sort()

  sources = await Promise.all(
    paths.map(async (relativePath) => ({
      relativePath,
      contents: await fs.readFile(path.join(REPO_ROOT, relativePath), 'utf8'),
    })),
  )
})

describe('the source tree', () => {
  it('is discovered, so an empty result cannot vacuously satisfy the rules below', () => {
    expect(sources.length).toBeGreaterThan(20)
  })

  it('includes both entry points', () => {
    const found = sources.map((source) => source.relativePath)

    expect(found).toContain('index.ts')
    expect(found).toContain('client/main.ts')
  })

  it('includes this scanner, which the content scans then skip to avoid matching their own patterns', () => {
    expect(sources.map((source) => source.relativePath)).toContain(SCANNER)
    expect(scannable().map((source) => source.relativePath)).not.toContain(SCANNER)
  })
})

describe("rule 2: every authored file opens with 'use sanity'", () => {
  it('holds for every .ts and .js file, this scanner included', () => {
    const offenders = sources
      .filter((source) => source.contents.split('\n')[0] !== DIRECTIVE)
      .map((source) => source.relativePath)

    expect(offenders).toStrictEqual([])
  })

  it('separates the directive from the rest of the file with a blank line', () => {
    const offenders = sources
      .filter((source) => source.contents.split('\n')[1] !== '')
      .map((source) => source.relativePath)

    expect(offenders).toStrictEqual([])
  })
})

describe('rule 3: default exports are confined to tooling configuration', () => {
  it('appears only in the allowlisted files', () => {
    const offenders = scannable()
      .filter((source) => source.contents.includes('export default'))
      .map((source) => source.relativePath)

    expect(offenders).toStrictEqual(DEFAULT_EXPORT_ALLOWLIST)
  })
})

describe('rule 5: every tooling suppression carries a rationale', () => {
  it('holds everywhere, so a bare suppression cannot be merged', () => {
    const offenders = scannable().flatMap((source) =>
      source.contents
        .split('\n')
        .map((line, index) => ({ line, lineNumber: index + 1 }))
        .filter(({ line }) => SUPPRESSION.test(line) && !CLOSES_COVERAGE_REGION.test(line) && !RATIONALE.test(line))
        .map(({ lineNumber }) => `${source.relativePath}:${String(lineNumber)}`),
    )

    expect(offenders).toStrictEqual([])
  })

  it('finds the suppressions that do exist, so the scan is not silently matching nothing', () => {
    const found = scannable().filter((source) => SUPPRESSION.test(source.contents))

    expect(found.length).toBeGreaterThan(0)
  })
})
