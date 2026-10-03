'use sanity'

import { expect } from 'vitest'

import { cast } from './cast.ts'

const NO_INTERVALS_STANDING = 0

const LEAKED_INTERVAL =
  'This test finished with a repeating timer still scheduled. An interval never completes on its own, so it goes on firing against a subject the test has abandoned for the rest of the file. Hold the cleanup whatever created it handed back and call it, or install fake timers for this test.'

type Schedule = typeof globalThis.setInterval
type Cancel = typeof globalThis.clearInterval
type IntervalHandle = Parameters<Cancel>[0]

type ScheduleOnce = typeof globalThis.setTimeout
type CancelOnce = typeof globalThis.clearTimeout
type TimeoutHandle = Parameters<CancelOnce>[0]

const standing = new Set<IntervalHandle>()
const pending = new Set<TimeoutHandle>()

export function watchIntervals(): void {
  const schedule: Schedule = globalThis.setInterval
  const cancel: Cancel = globalThis.clearInterval

  globalThis.setInterval = ((...args: Parameters<Schedule>) => {
    const handle = schedule(...args)
    standing.add(handle)

    return handle
  }) as Schedule

  globalThis.clearInterval = (handle: IntervalHandle) => {
    standing.delete(handle)
    cancel(handle)
  }
}

export function failOnLeakedInterval(): void {
  const leaked = [...standing]
  standing.clear()
  for (const handle of leaked) globalThis.clearInterval(handle)

  expect(leaked.length, LEAKED_INTERVAL).toBe(NO_INTERVALS_STANDING)
}

export function watchTimeouts(): void {
  const schedule: ScheduleOnce = globalThis.setTimeout
  const cancel: CancelOnce = globalThis.clearTimeout

  globalThis.setTimeout = cast<ScheduleOnce>((...args: Parameters<ScheduleOnce>) => {
    const handle = schedule(...args)
    pending.add(handle)

    return handle
  })

  globalThis.clearTimeout = (handle: TimeoutHandle) => {
    pending.delete(handle)
    cancel(handle)
  }
}

export function dropPendingTimeouts(): void {
  const abandoned = [...pending]
  pending.clear()
  for (const handle of abandoned) globalThis.clearTimeout(handle)
}
