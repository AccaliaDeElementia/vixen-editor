'use sanity'

import { given } from '../../../conditions.ts'
import { beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../../../src/client/layout/explorer.ts'

const { decideOpen } = TestOnly

const FIRST_RUN = null
const STORED_OPEN = true
const STORED_CLOSED = false
const CRAMPED = true
const ROOMY = false
const NOT_AUTO = false
const AUTO = true

beforeEach(() => {
  localStorage.clear()
})

describe('staying on a narrow viewport', () => {
  it('stays collapsed across a second render, which any resize causes', () => {
    const first = decideOpen(STORED_OPEN, CRAMPED, FIRST_RUN, NOT_AUTO)
    given(() => {
      expect(first).toStrictEqual({ open: false, auto: true })
    })

    expect(decideOpen(STORED_OPEN, CRAMPED, CRAMPED, first.auto)).toStrictEqual({ open: false, auto: true })
  })
})

describe('arriving on a narrow viewport', () => {
  it('collapses an explorer the reader had left open', () => {
    expect(decideOpen(STORED_OPEN, CRAMPED, FIRST_RUN, NOT_AUTO)).toStrictEqual({ open: false, auto: true })
  })

  it('leaves an explorer the reader had already closed alone', () => {
    expect(decideOpen(STORED_CLOSED, CRAMPED, FIRST_RUN, NOT_AUTO)).toStrictEqual({ open: false, auto: false })
  })
})

describe('arriving on a wide viewport', () => {
  it.each([
    ['an explorer left open', STORED_OPEN, true],
    ['an explorer left closed', STORED_CLOSED, false],
  ])('honours %s', (_label, stored, expected) => {
    expect(decideOpen(stored, ROOMY, FIRST_RUN, NOT_AUTO)).toStrictEqual({ open: expected, auto: false })
  })
})

describe('the window narrowing past the threshold', () => {
  it('collapses, and remembers that it was the one who did it', () => {
    expect(decideOpen(STORED_OPEN, CRAMPED, ROOMY, NOT_AUTO)).toStrictEqual({ open: false, auto: true })
  })
})

describe('the window widening past the threshold', () => {
  it('restores an explorer it collapsed itself', () => {
    expect(decideOpen(STORED_OPEN, ROOMY, CRAMPED, AUTO)).toStrictEqual({ open: true, auto: false })
  })

  it('leaves an explorer the reader closed by hand closed', () => {
    expect(decideOpen(STORED_CLOSED, ROOMY, CRAMPED, NOT_AUTO)).toStrictEqual({ open: false, auto: false })
  })
})

describe('a reader who opens it anyway while narrow', () => {
  it('is not overruled while the window stays narrow', () => {
    expect(decideOpen(STORED_OPEN, CRAMPED, CRAMPED, NOT_AUTO)).toStrictEqual({ open: true, auto: false })
  })

  it('is still not overruled when the window grows', () => {
    expect(decideOpen(STORED_OPEN, ROOMY, CRAMPED, AUTO)).toStrictEqual({ open: true, auto: false })
  })

  it('is collapsed again only by a fresh crossing into narrow', () => {
    expect(decideOpen(STORED_OPEN, CRAMPED, ROOMY, NOT_AUTO)).toStrictEqual({ open: false, auto: true })
  })
})
