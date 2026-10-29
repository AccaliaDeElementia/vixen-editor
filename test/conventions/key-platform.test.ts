'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { beforeAll, describe, expect, it } from 'vitest'

import { TestOnly } from '../../src/client/platform/key-spelling.ts'

const { PLATFORM_RULES } = TestOnly

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const UPSTREAM = 'node_modules/@codemirror/view/dist/index.js'
const PURE_MARKER = '/*@__PURE__*/'

let upstream = ''

beforeAll(async () => {
  upstream = (await fs.readFile(path.join(REPO_ROOT, UPSTREAM), 'utf8')).replaceAll(PURE_MARKER, '')
})

describe('the platform this module reads, against the one the editor reads', () => {
  it.each([
    ['a Mac', `mac: ios || /${PLATFORM_RULES.mac}/.test(nav.platform),`],
    ['Windows', `windows: /${PLATFORM_RULES.windows}/.test(nav.platform),`],
    ['Linux', `linux: /${PLATFORM_RULES.linux}/.test(nav.platform),`],
    ['the vendor behind a handheld', `const safari = !ie && /${PLATFORM_RULES.apple}/.test(nav.vendor);`],
    [
      'a handheld itself',
      `const ios = safari && (/${PLATFORM_RULES.mobile}/.test(nav.userAgent) || nav.maxTouchPoints > ${String(PLATFORM_RULES.desktopTouchPoints)});`,
    ],
  ])('reads %s by the rule this module holds', (_label, rule) => {
    expect(upstream).toContain(rule)
  })

  it('tries the platforms in the order this module tries them', () => {
    expect(upstream).toContain(
      'const currentPlatform = browser.mac ? "mac" : browser.windows ? "win" : browser.linux ? "linux" : "key";',
    )
  })

  it('falls back to the spelling that names no platform, as spellingsFor does', () => {
    expect(upstream).toContain('let name = b[platform] || b.key;')
  })
})
