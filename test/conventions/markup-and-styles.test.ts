'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const CLIENT = 'src/client'
const TEMPLATES = 'src/templates'
const STYLES = 'src/styles'

const SOURCE_EXTENSION = '.ts'
const TEMPLATE_EXTENSION = '.pug'
const STYLE_EXTENSION = '.scss'

const PART_LOOKED_UP = /\[data-part="(?<part>[a-z\-]+)"\]/gv
const PART_IN_MARKUP = /data-part='(?<part>[a-z\-]+)'/gv
const PART_IN_CODE = /data-part="(?<part>[a-z\-]+)"(?!\])/gv
const PART_ASSIGNED = /dataset\.part = '(?<part>[a-z\-]+)'/gv

const PROPERTY_READ = /var\(--(?<property>[a-z\-]+)/gv
const PROPERTY_DEFINED = /--(?<property>[a-z\-]+)\s*:/gv
const PROPERTY_NAMED = /'--(?<property>[a-z\-]+)'/gv

let clientSource = ''
let markupSource = ''
let styleSource = ''

async function readAllUnder(directory: string, extension: string): Promise<string> {
  const entries = await fs.readdir(path.join(REPO_ROOT, directory), { withFileTypes: true, recursive: true })
  const wanted = entries.filter((entry) => entry.isFile() && entry.name.endsWith(extension))
  const read = await Promise.all(
    wanted.map(async (entry) => await fs.readFile(path.join(entry.parentPath, entry.name), 'utf8')),
  )

  return read.join('\n')
}

function namesIn(source: string, pattern: RegExp, group: string): Set<string> {
  return new Set([...source.matchAll(pattern)].map((match) => match.groups?.[group] ?? ''))
}

beforeAll(async () => {
  clientSource = await readAllUnder(CLIENT, SOURCE_EXTENSION)
  markupSource = await readAllUnder(TEMPLATES, TEMPLATE_EXTENSION)
  styleSource = await readAllUnder(STYLES, STYLE_EXTENSION)
})

describe('the parts a module reaches for are parts something puts there', () => {
  it('leaves no lookup for a part that neither a template nor a module writes', () => {
    const written = new Set([
      ...namesIn(markupSource, PART_IN_MARKUP, 'part'),
      ...namesIn(clientSource, PART_IN_CODE, 'part'),
      ...namesIn(clientSource, PART_ASSIGNED, 'part'),
    ])
    const reached = [...namesIn(clientSource, PART_LOOKED_UP, 'part')]

    expect(reached.filter((part) => !written.has(part)).sort()).toStrictEqual([])
  })

  it('finds the lookups that do exist, so the comparison is not against an empty set', () => {
    expect(namesIn(clientSource, PART_LOOKED_UP, 'part').size).toBeGreaterThan(20)
  })
})

describe('the custom properties a stylesheet reads are properties something sets', () => {
  it('leaves no property read that no stylesheet defines and no module names', () => {
    const known = new Set([
      ...namesIn(styleSource, PROPERTY_DEFINED, 'property'),
      ...namesIn(clientSource, PROPERTY_NAMED, 'property'),
    ])
    const read = [
      ...new Set([
        ...namesIn(styleSource, PROPERTY_READ, 'property'),
        ...namesIn(clientSource, PROPERTY_READ, 'property'),
      ]),
    ]

    expect(read.filter((property) => !known.has(property)).sort()).toStrictEqual([])
  })

  it('finds the reads that do exist, so a renamed property cannot pass unnoticed', () => {
    expect(namesIn(styleSource, PROPERTY_READ, 'property').size).toBeGreaterThan(10)
  })
})
