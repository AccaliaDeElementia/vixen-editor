'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../src/client/layout/explorer.ts'

const { decideOpen } = TestOnly

const FIRST_RUN = null
const STORED_OPEN = true
const STORED_CLOSED = false
const CRAMPED = true
const ROOMY = false

beforeEach(() => {
  localStorage.clear()
})

describe('arriving on a narrow viewport', () => {
  it('collapses an explorer the reader had left open', () => {
    expect(decideOpen(STORED_OPEN, CRAMPED, FIRST_RUN)).toBe(false)
  })

  it('leaves an explorer the reader had already closed alone', () => {
    expect(decideOpen(STORED_CLOSED, CRAMPED, FIRST_RUN)).toBe(false)
  })
})

describe('arriving on a wide viewport', () => {
  it('honours the stored preference either way', () => {
    expect(decideOpen(STORED_OPEN, ROOMY, FIRST_RUN)).toBe(true)
    expect(decideOpen(STORED_CLOSED, ROOMY, FIRST_RUN)).toBe(false)
  })
})

describe('the window narrowing past the threshold', () => {
  it('collapses, and remembers that it was the one who did it', () => {
    expect(decideOpen(STORED_OPEN, CRAMPED, ROOMY)).toBe(false)
  })
})

describe('the window widening past the threshold', () => {
  it('restores an explorer it collapsed itself', () => {
    expect(decideOpen(STORED_OPEN, ROOMY, CRAMPED)).toBe(true)
  })

  it('leaves an explorer the reader closed by hand closed', () => {
    expect(decideOpen(STORED_CLOSED, ROOMY, CRAMPED)).toBe(false)
  })
})

describe('a reader who opens it anyway while narrow', () => {
  it('is not overruled while the window stays narrow', () => {
    expect(decideOpen(STORED_OPEN, CRAMPED, CRAMPED)).toBe(true)
  })

  it('is still not overruled when the window grows', () => {
    expect(decideOpen(STORED_OPEN, ROOMY, CRAMPED)).toBe(true)
  })

  it('is collapsed again only by a fresh crossing into narrow', () => {
    expect(decideOpen(STORED_OPEN, CRAMPED, ROOMY)).toBe(false)
  })
})
