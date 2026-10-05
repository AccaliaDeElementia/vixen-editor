'use sanity'

import { describe, expect, it } from 'vitest'

import { given } from './conditions.ts'
import { dropPendingTimeouts, failOnLeakedInterval, failOnLeakedTimeout, TestOnly } from './timers.ts'

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

const TICK_MS = 20

async function afterARealTick(): Promise<void> {
  const ticked: PromiseWithResolvers<void> = Promise.withResolvers()
  setTimeout(() => {
    ticked.resolve()
  }, TICK_MS)

  await ticked.promise
}

describe('a timeout the test walked away from', () => {
  it('fires when nothing cancels it, which is what makes the next claim mean anything', async () => {
    let fired = false
    setTimeout(() => {
      fired = true
    }, 0)

    await afterARealTick()

    expect(fired).toBe(true)
  })

  it('does not fire once the test that scheduled it has ended', async () => {
    let fired = false
    setTimeout(() => {
      fired = true
    }, 0)

    dropPendingTimeouts()
    await afterARealTick()

    expect(fired).toBe(false)
  })

  it('leaves a timer alone that was scheduled after the sweep', async () => {
    dropPendingTimeouts()
    let fired = false
    setTimeout(() => {
      fired = true
    }, 0)

    await afterARealTick()

    expect(fired).toBe(true)
  })

  it('is untroubled by a timer the code already cancelled itself', () => {
    clearTimeout(setTimeout(() => undefined, TICK_MS))

    expect(() => {
      dropPendingTimeouts()
    }).not.toThrow()
  })
})

describe('the leaked-timeout guard', () => {
  const A_WHILE_MS = 30_000

  it('refuses a test that left work of ours scheduled', () => {
    setTimeout(() => undefined, A_WHILE_MS)

    expect(() => {
      failOnLeakedTimeout()
    }).toThrow(/work our own code had scheduled/v)
  })

  it('says where the work was scheduled, so a reader can go and cancel it', () => {
    setTimeout(() => undefined, A_WHILE_MS)

    expect(() => {
      failOnLeakedTimeout()
    }).toThrow(/timers\.test\.ts/v)
  })

  it('says how long it would have waited, which is how long it holds its subject alive', () => {
    setTimeout(() => undefined, A_WHILE_MS)

    expect(() => {
      failOnLeakedTimeout()
    }).toThrow(/30000ms/v)
  })

  it('passes a test that scheduled nothing', () => {
    expect(() => {
      failOnLeakedTimeout()
    }).not.toThrow()
  })

  it('passes a test whose work already ran', async () => {
    setTimeout(() => undefined, 0)
    await afterARealTick()

    expect(() => {
      failOnLeakedTimeout()
    }).not.toThrow()
  })

  it('passes a test that cancelled what it scheduled', () => {
    clearTimeout(setTimeout(() => undefined, A_WHILE_MS))

    expect(() => {
      failOnLeakedTimeout()
    }).not.toThrow()
  })

  it('cancels what it found, so one leak does not fail every test after it', () => {
    setTimeout(() => undefined, A_WHILE_MS)
    given(() => {
      expect(() => {
        failOnLeakedTimeout()
      }).toThrow()
    })

    expect(() => {
      failOnLeakedTimeout()
    }).not.toThrow()
  })
})

describe('telling our own scheduled work from a library’s', () => {
  it('counts a frame in our own source', () => {
    expect(TestOnly.isOurs('dwell (/repo/src/client/toast.ts:92:13)')).toBe(true)
  })

  it('counts a frame in a test, since a test can leak too', () => {
    expect(TestOnly.isOurs('whatever (/repo/test/client/toast.test.ts:10:3)')).toBe(true)
  })

  it('leaves out a frame inside a dependency, which hands back no handle to cancel', () => {
    expect(TestOnly.isOurs('updateForFocusChange (/repo/node_modules/@codemirror/view/dist/index.js:5238:5)')).toBe(
      false,
    )
  })
})
