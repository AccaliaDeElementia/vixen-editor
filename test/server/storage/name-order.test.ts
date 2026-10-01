'use sanity'

import { describe, expect, it } from 'vitest'

import { compareNames } from '../../../src/server/storage/name-order.ts'

const SAME = 0

function sorted(names: readonly string[]): string[] {
  return [...names].sort(compareNames)
}

describe('the order a reader expects', () => {
  it('puts file9 before file10, which byte order does not', () => {
    expect(sorted(['file10.md', 'file9.md'])).toStrictEqual(['file9.md', 'file10.md'])
  })

  it('counts past a single digit, so file2 does not follow file10', () => {
    expect(sorted(['file10.md', 'file2.md', 'file1.md'])).toStrictEqual(['file1.md', 'file2.md', 'file10.md'])
  })

  it('compares each run of digits in a name, not just the first', () => {
    expect(sorted(['v1.10.2', 'v1.9.0'])).toStrictEqual(['v1.9.0', 'v1.10.2'])
  })

  it('reads a leading number as a number, so 9 comes before 2026', () => {
    expect(sorted(['2026-01', '9'])).toStrictEqual(['9', '2026-01'])
  })
})

describe('names that compare equal numerically but are not the same name', () => {
  const PRECOMPOSED = 'caf\u00e9.md'
  const DECOMPOSED = 'cafe\u0301.md'

  it('separates a padded number from an unpadded one, rather than calling them equal', () => {
    expect(compareNames('file09.md', 'file9.md')).not.toBe(SAME)
  })

  it('orders them the same way round every time, so a listing is stable', () => {
    expect(sorted(['file9.md', 'file09.md'])).toStrictEqual(sorted(['file09.md', 'file9.md']))
  })

  it('separates two spellings of one accented name, which the collator reads as equal', () => {
    expect(compareNames(PRECOMPOSED, DECOMPOSED)).not.toBe(SAME)
  })

  it('keeps that pair one way round whichever order they arrive in', () => {
    expect(sorted([DECOMPOSED, PRECOMPOSED])).toStrictEqual(sorted([PRECOMPOSED, DECOMPOSED]))
  })
})

describe('a name against itself', () => {
  it('reports no difference, or a sort would never settle', () => {
    expect(compareNames('notes.md', 'notes.md')).toBe(SAME)
  })
})
