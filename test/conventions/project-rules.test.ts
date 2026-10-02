'use sanity'

import { readFileSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { TestOnly as safePathTestOnly } from '../../src/server/storage/safe-path.ts'
import { isRecord } from '../../src/shared/guards.ts'
import vitestConfig from '../../vitest.config.ts'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const SOURCE_DIRECTORIES = ['src', 'scripts', 'tools', 'test', 'test-browser']
const ROOT_SOURCE_FILES = ['vitest.config.ts', 'eslint.config.js']

const TYPECHECK_PROJECTS = ['tsconfig.server.json', 'tsconfig.client.json', 'tsconfig.test-browser.json']
const PORTABILITY_PROJECTS = ['tsconfig.server.json', 'tsconfig.client.json']

const SOURCE_EXTENSION = /\.(?:ts|js)$/v

const DIRECTIVE = "'use sanity'"
const DEFAULT_EXPORT_ALLOWLIST = ['eslint.config.js', 'test-browser/playwright.config.ts', 'vitest.config.ts']

const SCANNER = 'test/conventions/project-rules.test.ts'

const POLLED_WAIT = /\bvi\.waitFor\s*\(/v
const HAND_ROLLED_TIMER = /\bset(?:Timeout|Interval)\s*\(/v
const RUNTIME_DECIDES_THE_MOMENT = 'test/rejections.ts'
const PROVES_THE_TIMER_GUARD = 'test/timers.test.ts'
const MAY_SCHEDULE_A_TIMER = [RUNTIME_DECIDES_THE_MOMENT, PROVES_THE_TIMER_GUARD]
const UNNAMED_TIMEOUT = /\{\s*timeout:\s*\d/v
const UNNAMED_PAINT_WAIT = /waitForTimeout\(\s*\d/v

const EXPORTED_DECLARATION = /^export\s+(?:async\s+)?(?:function|const|class|interface|type)\s+(?<name>\w+)/gmv
const EXPORTED_BINDINGS = /^export\s+(?:type\s+)?\{(?<names>[^\}]*)\}/gmv

const ATOMIC_WRITE = 'src/server/storage/atomic-write.ts'
const DIRECT_WRITE = /\bwriteFile\(/v

const SUPPRESSION = /eslint-disable|v8 ignore/v
const CLOSES_COVERAGE_REGION = /v8 ignore (?:stop|end)/v
const RATIONALE = /--\s*\S/v

const ANY_DIRECTORIES = String.raw`(?:[^\/]+\/)*`
const ANY_NAME = String.raw`[^\/]*`

function asRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^$\{\}\(\)\|\[\]\\]/gv, String.raw`\$&`)
  const expanded = escaped.replace(/\*\*\/|\*/gv, (token) => (token === '*' ? ANY_NAME : ANY_DIRECTORIES))

  return new RegExp(`^${expanded}$`, 'v')
}

function matches(pattern: string, filePath: string): boolean {
  return asRegExp(pattern).test(filePath)
}

interface SourceFile {
  relativePath: string
  contents: string
}

let sources: SourceFile[] = []

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

function importers(): SourceFile[] {
  return sources
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

  it.each(['src/server/index.ts', 'src/client/main.ts'])('includes the %s entry point', (entryPoint) => {
    expect(sources.map((source) => source.relativePath)).toContain(entryPoint)
  })

  it('includes this scanner, so it cannot escape the rules it enforces', () => {
    expect(sources.map((source) => source.relativePath)).toContain(SCANNER)
  })

  it('then skips it for the content scans, which would otherwise match their own patterns', () => {
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
    const withoutLineComments = readFileSync(path.join(REPO_ROOT, configPath), 'utf8').replace(/^\s*\/\/.*$/gmv, '')
    const parsed: unknown = JSON.parse(withoutLineComments)
    if (typeof parsed !== 'object' || parsed === null) return []
    const { include } = parsed as { include?: unknown }
    return Array.isArray(include) ? include.filter((entry): entry is string => typeof entry === 'string') : []
  }

  function filedUnder(relativePath: string, configPaths: readonly string[]): string[] {
    return configPaths.filter((configPath) => includesOf(configPath).some((pattern) => matches(pattern, relativePath)))
  }

  it('leaves no source file outside every project, whatever directory it lives in', () => {
    const unchecked = sources.filter((source) => filedUnder(source.relativePath, TYPECHECK_PROJECTS).length === 0)

    expect(unchecked.map((source) => source.relativePath)).toStrictEqual([])
  })

  it('compiles shared code under both halves, which is what proves it is portable', () => {
    const notBoth = sources
      .filter((source) => source.relativePath.startsWith(SHARED))
      .filter((source) => filedUnder(source.relativePath, PORTABILITY_PROJECTS).length !== PORTABILITY_PROJECTS.length)

    expect(notBoth.map((source) => source.relativePath)).toStrictEqual([])
  })

  it('finds shared code at all, so that comparison is not passing vacuously', () => {
    expect(sources.filter((source) => source.relativePath.startsWith(SHARED)).length).toBeGreaterThan(0)
  })
})

const APPROVED_OVERRIDES = [
  { files: ['test/**/*.ts', 'test-browser/**/*.ts'], rule: '@typescript-eslint/no-magic-numbers' },
  { files: ['test/**/*.ts', 'test-browser/**/*.ts'], rule: '@typescript-eslint/promise-function-async' },
  { files: ['test/**/*.ts', 'test-browser/**/*.ts'], rule: 'max-lines' },
  { files: ['test/**/*.ts', 'test-browser/**/*.ts'], rule: 'max-nested-callbacks' },
  { files: ['src/**/*.ts', 'scripts/**/*.ts', 'tools/**/*.ts'], rule: '@typescript-eslint/no-restricted-imports' },
  { files: ['*.config.ts'], rule: '@typescript-eslint/no-magic-numbers' },
]

const BASELINE_FILES = '**/*.js,**/*.ts'

interface ScopedRule {
  files: string[]
  rule: string
}

interface Relaxation extends ScopedRule {
  off: boolean
}

function relaxationsIn(block: unknown): Relaxation[] {
  if (!isRecord(block) || !isRecord(block.rules)) return []
  const files = Array.isArray(block.files) ? block.files.filter((f): f is string => typeof f === 'string') : []
  if (files.join(',') === BASELINE_FILES) return []

  return Object.entries(block.rules).map(([rule, setting]) => ({ files, rule, off: setting === 'off' }))
}

function describeRelaxation({ files, rule }: ScopedRule): string {
  return `${files.join(',')} -> ${rule}`
}

describe('every scoped eslint override is one that was approved', () => {
  let relaxations: Relaxation[] = []

  beforeAll(async () => {
    const module: unknown = await import(pathToFileURL(path.join(REPO_ROOT, 'eslint.config.js')).href)
    const loaded = isRecord(module) ? module.default : undefined
    relaxations = Array.isArray(loaded) ? loaded.flatMap(relaxationsIn) : []
  })

  it('finds the config at all, so the checks below are not vacuous', () => {
    expect(relaxations.length).toBeGreaterThan(0)
  })

  it('skips the baseline block, or every rule love sets would look like an override', () => {
    expect(relaxations.length).toBeLessThan(APPROVED_OVERRIDES.length + 1)
  })

  it('matches the approved list, so a new one cannot land unreviewed', () => {
    expect(relaxations.map(describeRelaxation).toSorted((a, b) => a.localeCompare(b))).toStrictEqual(
      APPROVED_OVERRIDES.map(describeRelaxation).toSorted((a, b) => a.localeCompare(b)),
    )
  })

  it('switches nothing off for shipped code, which is what the list is protecting', () => {
    const shipped = relaxations.filter(({ files, off }) => off && files.some((pattern) => pattern.startsWith('src/')))

    expect(shipped.map(describeRelaxation)).toStrictEqual([])
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

const SHARED = 'src/shared/'
const TEST_ONLY = 'TestOnly'

async function guide(): Promise<string> {
  return await fs.readFile(path.join(REPO_ROOT, 'CLAUDE.md'), 'utf8')
}

function compare(a: string, b: string): number {
  return a.localeCompare(b)
}
const WHOLE_MODULE = '*'
const RUNTIME_EXPORT = /^export\s+(?:async\s+)?(?:function|const|class)\s+(?<name>\w+)/gmv
const TYPE_EXPORT = /^export\s+(?:interface|type)\s/v

function runtimeExportsIn(contents: string): string[] {
  return [...contents.matchAll(RUNTIME_EXPORT)].map((match) => match.groups?.name ?? '').filter((name) => name !== '')
}

const IMPORT_CLAUSE =
  /^import\s+(?:type\s+)?(?<first>\{[^\}]*\}|\*\s+as\s+\w+|\w+)?\s*(?:,\s*(?<second>\{[^\}]*\}))?\s*from\s*'(?<from>[^']*)'/gmv
const REEXPORT_FROM = /^export\s+(?:type\s+)?\{(?<names>[^\}]*)\}\s*from\s*'(?<from>[^']*)'/gmv

function resolveSpecifier(importer: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null

  const segments = importer.split('/').slice(0, -1)
  for (const part of specifier.split('/')) {
    if (part === '.') continue
    if (part === '..') segments.pop()
    else segments.push(part)
  }

  return segments.join('/')
}

function localNamesIn(clause: string): string[] {
  return clause
    .replaceAll(/[\{\}]/gv, '')
    .split(',')
    .map(
      (entry) =>
        entry
          .trim()
          .replace(/^type\s+/v, '')
          .split(/\s+as\s+/v)[0]
          ?.trim() ?? '',
    )
    .filter((name) => /^\w+$/v.test(name))
}

function namesInClause(clause: string | undefined): string[] {
  if (clause === undefined) return []
  if (clause.startsWith('*')) return [WHOLE_MODULE]

  return clause.startsWith('{') ? localNamesIn(clause) : []
}

function importedFrom(source: SourceFile): Array<[string, string[]]> {
  return [...source.contents.matchAll(IMPORT_CLAUSE)].flatMap((match) => {
    const module = resolveSpecifier(source.relativePath, match.groups?.from ?? '')
    if (module === null) return []

    const names = [...namesInClause(match.groups?.first), ...namesInClause(match.groups?.second)]

    return names.length === 0 ? [] : [[module, names] as [string, string[]]]
  })
}

function reexportedFrom(source: SourceFile): Array<[string, string[]]> {
  return [...source.contents.matchAll(REEXPORT_FROM)].flatMap((match) => {
    const module = resolveSpecifier(source.relativePath, match.groups?.from ?? '')

    return module === null ? [] : [[module, localNamesIn(match.groups?.names ?? '')] as [string, string[]]]
  })
}

function importGraph(sources: readonly SourceFile[]): Map<string, Set<string>> {
  const consumed = new Map<string, Set<string>>()

  for (const source of sources) {
    for (const [module, names] of [...importedFrom(source), ...reexportedFrom(source)]) {
      const already = consumed.get(module) ?? new Set<string>()
      for (const name of names) already.add(name)
      consumed.set(module, already)
    }
  }

  return consumed
}

function consumes(graph: Map<string, Set<string>>, module: string, name: string): boolean {
  const names = graph.get(module)

  return names !== undefined && (names.has(name) || names.has(WHOLE_MODULE))
}

function exportedNamesIn(contents: string): string[] {
  const declared = [...contents.matchAll(EXPORTED_DECLARATION)].map((match) => match.groups?.name ?? '')

  // In `export { b as c }` the surface is `c`; `b` is a local name.
  const rebound = [...contents.matchAll(EXPORTED_BINDINGS)].flatMap((match) =>
    (match.groups?.names ?? '')
      .split(',')
      .map(
        (entry) =>
          entry
            .trim()
            .split(/\s+as\s+/v)
            .at(-1) ?? '',
      )
      .filter((name) => /^\w+$/v.test(name)),
  )

  return [...declared, ...rebound].filter((name) => name !== '')
}

describe('every export is consumed by something', () => {
  it('leaves no export under src/ that nothing imports', () => {
    const graph = importGraph(importers())
    const orphans = scannable()
      .filter((source) => source.relativePath.startsWith('src/'))
      .flatMap((source) =>
        exportedNamesIn(source.contents)
          .filter((name) => !consumes(graph, source.relativePath, name))
          .map((name) => `${source.relativePath}: ${name}`),
      )

    expect(orphans).toStrictEqual([])
  })

  it('finds the exports that do exist, so the scan is not passing vacuously', () => {
    const found = scannable()
      .filter((source) => source.relativePath.startsWith('src/'))
      .flatMap((source) => exportedNamesIn(source.contents))

    expect(found.length).toBeGreaterThan(100)
  })

  it('keeps every test-only runtime export inside a TestOnly container', () => {
    const shipping = scannable().filter(
      (source) =>
        source.relativePath.startsWith('src/') ||
        source.relativePath.startsWith('scripts/') ||
        source.relativePath.startsWith('tools/'),
    )
    const graph = importGraph(shipping)

    const leaked = shipping
      .filter((source) => source.relativePath.startsWith('src/'))
      .flatMap((source) =>
        runtimeExportsIn(source.contents)
          .filter((name) => name !== TEST_ONLY)
          .filter((name) => !consumes(graph, source.relativePath, name))
          .map((name) => `${source.relativePath}: ${name}`),
      )

    expect(leaked).toStrictEqual([])
  })

  it.each([
    ['an interface, which no runtime container can hold', 'export interface Runtime {', true],
    ['a function, which one can', 'export function startServer(', false],
  ])('exempts %s', (_label, declaration, exempt) => {
    expect(TYPE_EXPORT.test(declaration)).toBe(exempt)
  })

  it('reads a renamed re-export as the name it presents, not the one it wraps', () => {
    expect(exportedNamesIn("export { TOAST_SELECTOR as STATUS_SELECTOR } from './toast.ts'")).toStrictEqual([
      'STATUS_SELECTOR',
    ])
  })
})

describe('src/shared is what both sides need', () => {
  function importsOfSharedModule(from: string): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>()

    for (const source of sources.filter((candidate) => candidate.relativePath.startsWith(from))) {
      for (const [module, names] of importedFrom(source)) {
        if (!module.startsWith(SHARED)) continue
        const already = graph.get(module) ?? new Set<string>()
        for (const name of names) already.add(name)
        graph.set(module, already)
      }
    }

    return graph
  }

  function sharedModules(): string[] {
    return sources
      .filter((source) => source.relativePath.startsWith(SHARED))
      .map((source) => source.relativePath)
      .sort(compare)
  }

  it('finds shared modules at all, so the checks below are not vacuous', () => {
    expect(sharedModules().length).toBeGreaterThan(0)
  })

  it('is imported by both sides, every module', () => {
    const client = importsOfSharedModule('src/client/')
    const server = importsOfSharedModule('src/server/')

    const lopsided = sharedModules().filter((module) => !client.has(module) || !server.has(module))

    expect(lopsided).toStrictEqual([])
  })

  it('has at least one export both sides import, so its halves cannot have separate audiences', () => {
    const client = importsOfSharedModule('src/client/')
    const server = importsOfSharedModule('src/server/')

    const disjoint = sharedModules().filter((module) => {
      const fromClient = client.get(module) ?? new Set<string>()

      return ![...(server.get(module) ?? new Set<string>())].some((name) => fromClient.has(name))
    })

    expect(disjoint).toStrictEqual([])
  })

  it('never reaches back into client or server', () => {
    const offenders = sources
      .filter((source) => source.relativePath.startsWith(SHARED))
      .flatMap((source) =>
        importedFrom(source)
          .map(([module]) => module)
          .filter((module) => module.startsWith('src/client/') || module.startsWith('src/server/'))
          .map((module) => `${source.relativePath} -> ${module}`),
      )

    expect(offenders).toStrictEqual([])
  })
})

describe('every store write goes through the atomic helpers', () => {
  it('leaves no direct write to a document, image or metadata file', () => {
    const offenders = scannable()
      .filter((source) => source.relativePath.startsWith('src/') && source.relativePath !== ATOMIC_WRITE)
      .filter((source) => DIRECT_WRITE.test(source.contents))
      .map((source) => source.relativePath)

    expect(offenders).toStrictEqual([])
  })

  it('matches the writes the helpers themselves perform, so the scan is not looking for nothing', () => {
    const helpers = sources.find((source) => source.relativePath === ATOMIC_WRITE)

    expect(helpers?.contents).toMatch(DIRECT_WRITE)
  })
})

describe('the documented name rules match the ones the validator applies', () => {
  const NAME_RULE_TABLE = /Rejected in a path segment[\s\S]*?\n\n`\//v
  const DOCUMENTED = /^\| `(?<reason>[^`]+)`\s*\|/gmv

  function documentedReasons(guide: string): string[] {
    const table = NAME_RULE_TABLE.exec(guide)?.[0] ?? ''

    return [...table.matchAll(DOCUMENTED)].map((match) => match.groups?.reason ?? '').sort(compare)
  }

  const { NAME_RULES } = safePathTestOnly

  function applied(): string[] {
    return NAME_RULES.map((rule) => rule.reason).sort(compare)
  }

  it('documents every rule the validator applies', async () => {
    expect(documentedReasons(await guide())).toStrictEqual(applied())
  })

  it('found rules at all, so the comparison is not passing vacuously', async () => {
    expect(documentedReasons(await guide()).length).toBeGreaterThan(5)
  })
})

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
    /refuse\(c, (?<status>HTTP_[A-Z_]+), '(?<code>[A-Z_]+)'/gv,
    /status: (?<status>HTTP_[A-Z_]+),\s*\n?\s*code: '(?<code>[A-Z_]+)'/gv,
    /code: '(?<code>[A-Z_]+)' \},\s*(?<status>HTTP_[A-Z_]+)/gv,
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

    for (const match of guide.matchAll(/^\|\s*`(?<code>[A-Z_]+)`\s*\|\s*(?<status>\d{3})\s*\|/gmv)) {
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

describe('waiting for work to finish', () => {
  function suiteFiles(prefix: string): SourceFile[] {
    return scannable().filter((source) => source.relativePath.startsWith(prefix))
  }

  it('leaves no polled wait, because every wait now has a signal to await', () => {
    const polling = suiteFiles('test').filter((source) => POLLED_WAIT.test(source.contents))

    expect(polling.map((source) => source.relativePath)).toStrictEqual([])
  })

  it('recognises a polled wait when it sees one, so the scan is not passing vacuously', () => {
    expect(POLLED_WAIT.test('await vi.waitFor(() => undefined)')).toBe(true)
  })

  it('leaves no hand-rolled timer in the unit suite, where a signal is always available', () => {
    const yielding = suiteFiles('test/')
      .filter((source) => !MAY_SCHEDULE_A_TIMER.includes(source.relativePath))
      .filter((source) => HAND_ROLLED_TIMER.test(source.contents))

    expect(yielding.map((source) => source.relativePath)).toStrictEqual([])
  })

  it.each(MAY_SCHEDULE_A_TIMER)('finds the timer %s is allowed, so that scan is not passing vacuously', (allowed) => {
    const source = sources.find((candidate) => candidate.relativePath === allowed)

    expect(HAND_ROLLED_TIMER.test(source?.contents ?? '')).toBe(true)
  })

  it('leaves no bare number as a test timeout, so a slow test has to say what it waits for', () => {
    const unnamed = suiteFiles('test/').filter((source) => UNNAMED_TIMEOUT.test(source.contents))

    expect(unnamed.map((source) => source.relativePath)).toStrictEqual([])
  })

  it('recognises a bare timeout when it sees one, so that scan is not passing vacuously', () => {
    expect(UNNAMED_TIMEOUT.test('{ timeout: 5000 }')).toBe(true)
  })

  it('leaves no bare number waiting on paint, so a kept duration has to name what it outlasts', () => {
    const unnamed = suiteFiles('test-browser/').filter((source) => UNNAMED_PAINT_WAIT.test(source.contents))

    expect(unnamed.map((source) => source.relativePath)).toStrictEqual([])
  })

  it('recognises a bare paint wait when it sees one, so that scan is not passing vacuously', () => {
    expect(UNNAMED_PAINT_WAIT.test('await page.waitForTimeout(200)')).toBe(true)
  })

  it('accepts a timeout that was given a name', () => {
    expect(UNNAMED_TIMEOUT.test('{ timeout: FONT_LOAD_MS }')).toBe(false)
  })
})

interface DeclarationSite {
  file: string
  pattern: RegExp
}

const LANGUAGE_LEVEL_SITES: DeclarationSite[] = [
  { file: 'tsconfig.base.json', pattern: /"target":\s*"(?<value>[^"]+)"/gv },
  { file: 'tsconfig.client.json', pattern: /"lib":\s*\[\s*"(?<value>[^"]+)"/gv },
  { file: 'tsconfig.server.json', pattern: /"lib":\s*\[\s*"(?<value>[^"]+)"/gv },
  { file: 'tsconfig.test-browser.json', pattern: /"lib":\s*\[\s*"(?<value>[^"]+)"/gv },
  { file: 'scripts/build.ts', pattern: /target: '(?<value>es\d+)'/gv },
]

const RUNTIME_SITES: DeclarationSite[] = [
  { file: 'package.json', pattern: /"node": ">=(?<value>\d+)"/gv },
  { file: 'scripts/build.ts', pattern: /target: 'node(?<value>\d+)'/gv },
  { file: 'Dockerfile', pattern: /^FROM node:(?<value>\d+)-/gmv },
]

function declaredAt(site: DeclarationSite): string[] {
  const contents = readFileSync(path.join(REPO_ROOT, site.file), 'utf8')

  return [...contents.matchAll(site.pattern)].map((found) => (found.groups?.value ?? '').toLowerCase())
}

function everyDeclaration(sites: readonly DeclarationSite[]): string[] {
  return sites.flatMap(declaredAt)
}

describe('one fact in several files', () => {
  it('names the same language level everywhere it is declared', () => {
    expect([...new Set(everyDeclaration(LANGUAGE_LEVEL_SITES))]).toHaveLength(1)
  })

  it('finds a language level at every site, so a renamed option cannot hide', () => {
    const silent = LANGUAGE_LEVEL_SITES.filter((site) => declaredAt(site).length === 0)

    expect(silent.map((site) => site.file)).toStrictEqual([])
  })

  it('names the same node major everywhere it is declared', () => {
    expect([...new Set(everyDeclaration(RUNTIME_SITES))]).toHaveLength(1)
  })

  it('finds a node major at every site, including each stage of the image', () => {
    const counted = RUNTIME_SITES.map((site) => ({ file: site.file, found: declaredAt(site).length }))

    expect(counted).toStrictEqual([
      { file: 'package.json', found: 1 },
      { file: 'scripts/build.ts', found: 1 },
      { file: 'Dockerfile', found: 3 },
    ])
  })
})

const UNIT_TEST = /^test\/.*\.test\.ts$/v
const REPO_LEVEL_SUITE = 'test/conventions/'
const RUN_BY_ONE_PROJECT = 1

function unitTests(): SourceFile[] {
  return sources.filter((source) => UNIT_TEST.test(source.relativePath))
}

function shadowedModule(relativePath: string): string | null {
  const rest = relativePath.replace(/^test\//v, '').replace(/\.test\.ts$/v, '')
  const present = (candidate: string): boolean => sources.some((source) => source.relativePath === candidate)

  if (present(`src/${rest}.ts`)) return `src/${rest}.ts`

  const holdingModule = rest.replace(/\/[^\/]+$/v, '')
  if (holdingModule !== rest && present(`src/${holdingModule}.ts`)) return `src/${holdingModule}.ts`

  return present(`test/${rest}.ts`) ? `test/${rest}.ts` : null
}

function projectIncludes(): string[][] {
  const { test } = vitestConfig
  const projects = isRecord(test) && Array.isArray(test.projects) ? test.projects : []

  return projects.map((project) => {
    if (!isRecord(project)) return []
    const { test: settings } = project
    if (!isRecord(settings)) return []
    const { include } = settings

    return Array.isArray(include) ? include.filter((entry): entry is string => typeof entry === 'string') : []
  })
}

function projectsRunning(relativePath: string): number {
  return projectIncludes().filter((includes) => includes.some((pattern) => matches(pattern, relativePath))).length
}

describe('every unit test names the module it tests', () => {
  it('leaves no test outside the repo-level suite that shadows no module', () => {
    const orphans = unitTests()
      .filter((source) => !source.relativePath.startsWith(REPO_LEVEL_SUITE))
      .filter((source) => shadowedModule(source.relativePath) === null)

    expect(orphans.map((source) => source.relativePath)).toStrictEqual([])
  })

  it('finds the modules they shadow, so that scan is not passing vacuously', () => {
    const shadowing = unitTests().filter((source) => shadowedModule(source.relativePath) !== null)

    expect(shadowing.length).toBeGreaterThan(20)
  })

  it('reports nothing for a test naming a module that does not exist', () => {
    expect(shadowedModule('test/client/editor/invented.test.ts')).toBeNull()
  })
})

describe('every unit test is run by exactly one vitest project', () => {
  it('leaves none that no project would run, which fails silently rather than red', () => {
    const unrun = unitTests().filter((source) => projectsRunning(source.relativePath) < RUN_BY_ONE_PROJECT)

    expect(unrun.map((source) => source.relativePath)).toStrictEqual([])
  })

  it('leaves none that two projects would each run', () => {
    const doubled = unitTests().filter((source) => projectsRunning(source.relativePath) > RUN_BY_ONE_PROJECT)

    expect(doubled.map((source) => source.relativePath)).toStrictEqual([])
  })

  it('reads the includes from the config at all, so those scans are not vacuous', () => {
    expect(projectIncludes().flat().length).toBeGreaterThan(0)
  })

  it('reports no project for a path every include misses', () => {
    expect(projectsRunning('test/stranded/orphan.test.ts')).toBe(0)
  })
})
