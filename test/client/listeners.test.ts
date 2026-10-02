'use sanity'

import { describe, expect, it } from 'vitest'

import { given } from '../conditions.ts'
import { failOnLeakedListener } from './listeners.ts'

describe('the leaked-listener guard', () => {
  it('refuses a test that left a listener on the window', () => {
    window.addEventListener('resize', () => undefined)

    expect(() => {
      failOnLeakedListener()
    }).toThrow(/still registered on window or document/v)
  })

  it('names the target and the event, so the failure says what to release', () => {
    document.addEventListener('selectionchange', () => undefined)

    expect(() => {
      failOnLeakedListener()
    }).toThrow(/document:selectionchange/v)
  })

  it('passes a listener that was registered and then removed', () => {
    const heard = (): void => undefined
    window.addEventListener('scroll', heard)
    window.removeEventListener('scroll', heard)

    expect(() => {
      failOnLeakedListener()
    }).not.toThrow()
  })

  it('passes a one-shot listener that has already fired, because the browser removed it', () => {
    window.addEventListener('focus', () => undefined, { once: true })
    window.dispatchEvent(new Event('focus'))

    expect(() => {
      failOnLeakedListener()
    }).not.toThrow()
  })

  it('refuses a one-shot listener that never fired, because it is still registered', () => {
    window.addEventListener('focus', () => undefined, { once: true })

    expect(() => {
      failOnLeakedListener()
    }).toThrow(/window:focus/v)
  })

  it('tells a capturing registration from a bubbling one, so removing one leaves the other', () => {
    const heard = (): void => undefined
    window.addEventListener('resize', heard, true)
    window.addEventListener('resize', heard, false)
    window.removeEventListener('resize', heard, true)

    expect(() => {
      failOnLeakedListener()
    }).toThrow(/window:resize/v)
  })

  it('releases what it found, so one leak does not fail every test after it', () => {
    window.addEventListener('resize', () => undefined)
    given(() => {
      expect(() => {
        failOnLeakedListener()
      }).toThrow()
    })

    expect(() => {
      failOnLeakedListener()
    }).not.toThrow()
  })
})
