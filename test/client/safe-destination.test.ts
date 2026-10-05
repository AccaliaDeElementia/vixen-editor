'use sanity'

import { describe, expect, it } from 'vitest'

import { safeDestination } from '../../src/client/safe-destination.ts'
import { SCRIPT_URL, SCRIPT_URL_IN_CAPITALS } from './hostile-urls.ts'

describe('a destination the preview may hand to the browser', () => {
  it('allows a relative path, which is what documents in the store use', () => {
    expect(safeDestination('./a.md')).toBe('./a.md')
  })

  it('allows http', () => {
    expect(safeDestination('http://example.test/')).toBe('http://example.test/')
  })

  it('allows https', () => {
    expect(safeDestination('https://example.test/')).toBe('https://example.test/')
  })

  it('allows mailto', () => {
    expect(safeDestination('mailto:someone@example.test')).toBe('mailto:someone@example.test')
  })
})

describe('a destination it must refuse', () => {
  it('refuses javascript', () => {
    expect(safeDestination(SCRIPT_URL)).toBeNull()
  })

  it('refuses data, which can carry script inside an SVG', () => {
    expect(safeDestination('data:text/html,<script>alert(1)</script>')).toBeNull()
  })

  it('refuses a scheme hidden behind characters a browser discards', () => {
    expect(safeDestination('java\tscript:alert(1)')).toBeNull()
  })

  it('refuses a scheme written in capitals', () => {
    expect(safeDestination(SCRIPT_URL_IN_CAPITALS)).toBeNull()
  })

  it('refuses one the URL parser cannot read at all', () => {
    expect(safeDestination('http://[')).toBeNull()
  })
})
