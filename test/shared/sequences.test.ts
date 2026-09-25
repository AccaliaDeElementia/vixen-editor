'use sanity'

import { describe, expect, it } from 'vitest'

import { EMPTY, NOT_FOUND, PAST_SEPARATOR, SEQUENCE_START } from '../../src/shared/sequences.ts'

describe('SEQUENCE_START', () => {
  it('is the index a sequence begins at', () => {
    expect('abc'.charAt(SEQUENCE_START)).toBe('a')
    expect(['a', 'b'].slice(SEQUENCE_START)).toStrictEqual(['a', 'b'])
  })
})

describe('EMPTY', () => {
  it('is the length of a sequence holding nothing', () => {
    expect([].length).toBe(EMPTY)
    expect(''.length).toBe(EMPTY)
  })

  it('is not the same idea as SEQUENCE_START, though it shares a value', () => {
    expect(EMPTY).toBe(SEQUENCE_START)
  })
})

describe('NOT_FOUND', () => {
  it('is what a search of a string or an array answers when the target is absent', () => {
    expect('abc'.indexOf('z')).toBe(NOT_FOUND)
    expect('abc'.lastIndexOf('z')).toBe(NOT_FOUND)
    expect(['a'].indexOf('z')).toBe(NOT_FOUND)
  })

  it('is not the last-element offset that `at` takes, though it shares a value', () => {
    expect(['a', 'b'].at(NOT_FOUND)).toBe('b')
  })
})

describe('PAST_SEPARATOR', () => {
  it('steps from a found separator to the text after it', () => {
    expect('a/b'.slice('a/b'.lastIndexOf('/') + PAST_SEPARATOR)).toBe('b')
  })

  it('yields the whole string when there is no separator, because NOT_FOUND + it is the start', () => {
    expect(NOT_FOUND + PAST_SEPARATOR).toBe(SEQUENCE_START)
    expect('b'.slice('b'.lastIndexOf('/') + PAST_SEPARATOR)).toBe('b')
  })
})
