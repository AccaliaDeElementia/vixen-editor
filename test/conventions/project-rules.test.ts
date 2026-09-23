'use sanity'

import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const SOURCE_DIRECTORIES = ['src', 'scripts', 'test', 'test-browser']
const ROOT_SOURCE_FILES = ['vitest.config.ts', 'eslint.config.js']

const TYPECHECK_PROJECTS = ['tsconfig.server.json', 'tsconfig.client.json']
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

    expect(found).toContain('src/index.ts')
    expect(found).toContain('src/client/main.ts')
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

describe('every source file belongs to exactly one typecheck project', () => {
  function includesOf(configPath: string): string[] {
    const withoutLineComments = readFileSync(path.join(REPO_ROOT, configPath), 'utf8').replace(/^\s*\/\/.*$/gmu, '')
    const parsed: unknown = JSON.parse(withoutLineComments)
    if (typeof parsed !== 'object' || parsed === null) return []
    const { include } = parsed as { include?: unknown }
    return Array.isArray(include) ? include.filter((entry): entry is string => typeof entry === 'string') : []
  }

  function matches(pattern: string, filePath: string): boolean {
    if (!pattern.includes('*')) return pattern === filePath
    const prefix = pattern.replace(/\*\*\/\*\.ts$/u, '')
    return filePath.startsWith(prefix) && filePath.endsWith('.ts')
  }

  it('leaves no src file unchecked and none checked twice', () => {
    const projects = TYPECHECK_PROJECTS.map((configPath) => ({ configPath, includes: includesOf(configPath) }))

    const misfiled = sources
      .filter((source) => source.relativePath.startsWith('src/'))
      .map((source) => ({
        path: source.relativePath,
        projects: projects
          .filter(({ includes }) => includes.some((pattern) => matches(pattern, source.relativePath)))
          .map(({ configPath }) => configPath),
      }))
      .filter(({ projects: matched }) => matched.length !== 1)

    expect(misfiled).toStrictEqual([])
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

// An error-code table is exactly the kind of list that rots: nobody re-reads
// it when adding a code. The document and the server have to agree, or the
// table is worse than no table at all.
describe('the documented error codes match the ones the server emits', () => {
  const STATUS_NAMES: Readonly<Record<string, string>> = {
    HTTP_BAD_REQUEST: '400',
    HTTP_NOT_FOUND: '404',
    HTTP_CONFLICT: '409',
    HTTP_PRECONDITION_FAILED: '412',
    HTTP_CONTENT_TOO_LARGE: '413',
    HTTP_UNPROCESSABLE_CONTENT: '422',
    HTTP_PRECONDITION_REQUIRED: '428',
    HTTP_INTERNAL_SERVER_ERROR: '500',
    HTTP_SERVICE_UNAVAILABLE: '503',
  }

  const CODE_PATTERNS: readonly RegExp[] = [
    /refuse\(c, (?<status>HTTP_[A-Z_]+), '(?<code>[A-Z_]+)'/gu,
    /status: (?<status>HTTP_[A-Z_]+),\s*\n?\s*code: '(?<code>[A-Z_]+)'/gu,
    /code: '(?<code>[A-Z_]+)' \},\s*(?<status>HTTP_[A-Z_]+)/gu,
  ]

  function emittedCodes(source: string): Map<string, string> {
    const found = new Map<string, string>()

    for (const pattern of CODE_PATTERNS) {
      for (const match of source.matchAll(pattern)) {
        const { code, status } = match.groups ?? {}
        if (code !== undefined && status !== undefined) found.set(code, STATUS_NAMES[status] ?? status)
      }
    }

    return found
  }

  function documentedCodes(guide: string): Map<string, string> {
    const found = new Map<string, string>()

    for (const match of guide.matchAll(/^\|\s*`(?<code>[A-Z_]+)`\s*\|\s*(?<status>\d{3})\s*\|/gmu)) {
      const { code, status } = match.groups ?? {}
      if (code !== undefined && status !== undefined) found.set(code, status)
    }

    return found
  }

  async function bothSides(): Promise<{ emitted: Map<string, string>; documented: Map<string, string> }> {
    const files = await collect(path.join('src', 'server'))
    const sources = await Promise.all(files.map(async (file) => await fs.readFile(file, 'utf8')))

    return {
      emitted: emittedCodes(sources.join('\n')),
      documented: documentedCodes(await fs.readFile(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8')),
    }
  }

  it('documents every code the server can return', async () => {
    const { emitted, documented } = await bothSides()

    expect([...emitted.keys()].filter((code) => !documented.has(code))).toStrictEqual([])
  })

  it('documents no code the server cannot return', async () => {
    const { emitted, documented } = await bothSides()

    expect([...documented.keys()].filter((code) => !emitted.has(code))).toStrictEqual([])
  })

  it('agrees on the status of every code', async () => {
    const { emitted, documented } = await bothSides()
    const disagreements = [...emitted].filter(([code, status]) => documented.get(code) !== status)

    expect(disagreements).toStrictEqual([])
  })

  it('found codes at all, so the comparison is not passing vacuously', async () => {
    const { emitted } = await bothSides()

    expect(emitted.size).toBeGreaterThan(5)
  })
})
