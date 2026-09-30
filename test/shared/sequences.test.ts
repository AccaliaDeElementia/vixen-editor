'use sanity'

import { given } from '../conditions.ts'
import { describe, expect, it } from 'vitest'

import { EMPTY, NOT_FOUND, PAST_SEPARATOR, SEQUENCE_START } from '../../src/shared/sequences.ts'

describe('SEQUENCE_START', () => {
  it('is the index a string begins at', () => {
    expect('abc'.charAt(SEQUENCE_START)).toBe('a')
  })

  it('is the index an array begins at', () => {
    expect(['a', 'b'].slice(SEQUENCE_START)).toStrictEqual(['a', 'b'])
  })
})

describe('EMPTY', () => {
  it.each([
    ['an array', []],
    ['a string', ''],
  ])('is the length of %s holding nothing', (_label, nothing) => {
    expect(nothing.length).toBe(EMPTY)
  })

  it('is not the same idea as SEQUENCE_START, though it shares a value', () => {
    expect(EMPTY).toBe(SEQUENCE_START)
  })
})

describe('NOT_FOUND', () => {
  it.each([
    ['indexOf on a string', 'abc'.indexOf('z')],
    ['lastIndexOf on a string', 'abc'.lastIndexOf('z')],
    ['indexOf on an array', ['a'].indexOf('z')],
  ])('is what %s answers when the target is absent', (_label, answer) => {
    expect(answer).toBe(NOT_FOUND)
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
    given(() => {
      expect(NOT_FOUND + PAST_SEPARATOR).toBe(SEQUENCE_START)
    })

    expect('b'.slice('b'.lastIndexOf('/') + PAST_SEPARATOR)).toBe('b')
  })
})
