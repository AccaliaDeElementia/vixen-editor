'use sanity'

import { describe, expect, it } from 'vitest'

import { given } from '../conditions.ts'
import { failOnLeakedInterval } from '../timers.ts'

const SOME_PERIOD_MS = 60_000

describe('the leaked-interval guard', () => {
  it('refuses a test that left a repeating timer standing', () => {
    setInterval(() => undefined, SOME_PERIOD_MS)

    expect(() => {
      failOnLeakedInterval()
    }).toThrow(/repeating timer still scheduled/v)
  })

  it('passes a test that scheduled nothing', () => {
    expect(() => {
      failOnLeakedInterval()
    }).not.toThrow()
  })

  it('cancels what it found, so one leak does not fail every test after it', () => {
    setInterval(() => undefined, SOME_PERIOD_MS)
    given(() => {
      expect(() => {
        failOnLeakedInterval()
      }).toThrow()
    })

    expect(() => {
      failOnLeakedInterval()
    }).not.toThrow()
  })

  it('counts a timer it was handed back to cancel as no longer standing', () => {
    clearInterval(setInterval(() => undefined, SOME_PERIOD_MS))

    expect(() => {
      failOnLeakedInterval()
    }).not.toThrow()
  })
})
