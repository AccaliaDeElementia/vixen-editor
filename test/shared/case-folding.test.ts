'use sanity'

import { describe, expect, it } from 'vitest'

import { foldedMatchesIn } from '../../src/shared/case-folding.ts'

const A_LINE = 'the lantern lit the lane'
const CAPITALISED = 'The Lantern lit the lane'
const SAID_THREE_TIMES = 'one one one'
const FOUR_OF_THEM = 'aaaa'

const FOLDS_TO_TWO_UNITS = 'İ'
const LONGER_THAN_IT_IS = 2
const AFTER_A_GROWING_CHARACTER = `${FOLDS_TO_TWO_UNITS}stanbul: the lantern`
const TWICE_AFTER_IT = `${FOLDS_TO_TWO_UNITS} one one`

describe('finding a word whatever case it was written in', () => {
  it('gives where the match starts, so a reader lands on the word rather than beside it', () => {
    expect(foldedMatchesIn(A_LINE, 'lantern')).toStrictEqual([A_LINE.indexOf('lantern')])
  })

  it('finds a word the text capitalised and the reader did not', () => {
    expect(foldedMatchesIn(CAPITALISED, 'lantern')).toStrictEqual([CAPITALISED.indexOf('Lantern')])
  })

  it('finds a word the reader capitalised and the text did not', () => {
    expect(foldedMatchesIn(A_LINE, 'LANTERN')).toStrictEqual([A_LINE.indexOf('lantern')])
  })

  it('gives every match rather than only the first', () => {
    expect(foldedMatchesIn(SAID_THREE_TIMES, 'one')).toStrictEqual([0, 4, 8])
  })

  it('leaves out a match that overlaps one it has already given', () => {
    expect(foldedMatchesIn(FOUR_OF_THEM, 'aa')).toStrictEqual([0, 2])
  })

  it('gives nothing back for a word the text does not hold', () => {
    expect(foldedMatchesIn(A_LINE, 'beacon')).toStrictEqual([])
  })
})

describe('text whose case folds to a different length', () => {
  it('relies on a character whose lowercase is longer than it is, which is what shifts the offsets', () => {
    expect(FOLDS_TO_TWO_UNITS.toLowerCase()).toHaveLength(LONGER_THAN_IT_IS)
  })

  it('gives the offset the text holds, not the one the folded copy holds', () => {
    expect(foldedMatchesIn(AFTER_A_GROWING_CHARACTER, 'lantern')).toStrictEqual([
      AFTER_A_GROWING_CHARACTER.indexOf('lantern'),
    ])
  })

  it('counts every match past it from the text as written, not only the first', () => {
    expect(foldedMatchesIn(TWICE_AFTER_IT, 'one')).toStrictEqual([
      TWICE_AFTER_IT.indexOf('one'),
      TWICE_AFTER_IT.lastIndexOf('one'),
    ])
  })

  it('folds it onto the letter the reader typed, which is what a case-blind search means', () => {
    expect(foldedMatchesIn(FOLDS_TO_TWO_UNITS, 'i')).toStrictEqual([0])
  })
})
