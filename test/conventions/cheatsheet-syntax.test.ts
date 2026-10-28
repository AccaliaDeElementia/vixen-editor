'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { parser } from '@lezer/markdown'
import { beforeAll, describe, expect, it } from 'vitest'

import { VIXEN_MARKDOWN_EXTENSIONS } from '../../src/shared/markdown-tree.ts'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CHEATSHEET = 'src/assets/markdown-cheatsheet.md'

const DEMONSTRATED = [
  'ATXHeading1',
  'ATXHeading2',
  'ATXHeading3',
  'Emphasis',
  'StrongEmphasis',
  'Strikethrough',
  'InlineCode',
  'BulletList',
  'OrderedList',
  'Task',
  'Link',
  'Image',
  'Autolink',
  'URL',
  'Blockquote',
  'FencedCode',
  'Table',
]

const shaped = parser.configure(VIXEN_MARKDOWN_EXTENSIONS)

let source = ''
let parsed = new Set<string>()

beforeAll(async () => {
  source = await fs.readFile(path.join(REPO_ROOT, CHEATSHEET), 'utf8')
  const found = new Set<string>()
  shaped.parse(source).iterate({
    enter: (node) => {
      found.add(node.name)
    },
  })
  parsed = found
})

describe('the cheatsheet only advertises syntax this editor understands', () => {
  it.each(DEMONSTRATED)('shows %s, and the parser reads it as that', (construct) => {
    expect(parsed.has(construct)).toBe(true)
  })

  it('writes the callout keywords the editor decorates', () => {
    expect(['TODO:', 'FIXME:', 'NOTE:'].filter((keyword) => !source.includes(keyword))).toStrictEqual([])
  })

  it('parses into more than a wall of paragraphs, so the comparison is not vacuous', () => {
    expect(parsed.size).toBeGreaterThan(DEMONSTRATED.length)
  })
})
