'use sanity'

import { expect } from 'vitest'

import { cast } from './cast.ts'

const NO_INTERVALS_STANDING = 0
const NOTHING_LEAKED: string[] = []
const NO_DELAY = 0
const FIRST_FRAME = 1
const LIBRARY = 'node_modules'
const THIS_MODULE = 'test/timers.ts'

const LEAKED_TIMEOUT =
  'This test finished with work our own code had scheduled for later. It will fire against a subject the test has abandoned, and until it does it holds that subject alive. Tear down whatever scheduled it, or hold the cancel it handed back and call it. Timers scheduled inside node_modules are not counted.'

const LEAKED_INTERVAL =
  'This test finished with a repeating timer still scheduled. An interval never completes on its own, so it goes on firing against a subject the test has abandoned for the rest of the file. Hold the cleanup whatever created it handed back and call it, or install fake timers for this test.'

type Schedule = typeof globalThis.setInterval
type Cancel = typeof globalThis.clearInterval
type IntervalHandle = Parameters<Cancel>[0]

type ScheduleOnce = typeof globalThis.setTimeout
type CancelOnce = typeof globalThis.clearTimeout
type TimeoutHandle = Parameters<CancelOnce>[0]

interface Scheduled {
  origin: string
  delay: number
  fired: boolean
  ours: boolean
}

const standing = new Set<IntervalHandle>()
const pending = new Map<TimeoutHandle, Scheduled>()

function schedulingSite(): string {
  const frames = (new Error('scheduled').stack ?? '').split('\n').slice(FIRST_FRAME)
  const caller = frames.find((frame) => frame.includes('at ') && !frame.includes(THIS_MODULE))

  return (caller ?? 'an unknown caller').trim().replace(/^at /v, '')
}

type Work = (...args: unknown[]) => void

type Scheduler = (work: Work, delay?: number, ...rest: unknown[]) => TimeoutHandle

interface Watched {
  scheduled: Scheduled
  fire: Work
}

function isOurs(origin: string): boolean {
  return !origin.includes(LIBRARY)
}

function watched(work: unknown, origin: string, delay: number): Watched {
  const scheduled: Scheduled = { origin, delay, fired: false, ours: isOurs(origin) }
  const fire: Work = (...args: unknown[]) => {
    scheduled.fired = true
    cast<Work>(work)(...args)
  }

  return { scheduled, fire }
}

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
  const schedule = cast<Scheduler>(globalThis.setTimeout)
  const cancel: CancelOnce = globalThis.clearTimeout

  globalThis.setTimeout = cast<ScheduleOnce>((work: unknown, delay?: number, ...rest: unknown[]) => {
    const { scheduled, fire } = watched(work, schedulingSite(), delay ?? NO_DELAY)
    const handle = schedule(fire, delay, ...rest)
    pending.set(handle, scheduled)

    return handle
  })

  globalThis.clearTimeout = (handle: TimeoutHandle) => {
    pending.delete(handle)
    cancel(handle)
  }
}

function describeLeak({ origin, delay }: Scheduled): string {
  return `${origin} [${String(delay)}ms]`
}

export function failOnLeakedTimeout(): void {
  const leaked = [...pending.values()].filter((scheduled) => scheduled.ours && !scheduled.fired).map(describeLeak)
  dropPendingTimeouts()

  expect(leaked, `${LEAKED_TIMEOUT}\n  ${leaked.join('\n  ')}`).toStrictEqual(NOTHING_LEAKED)
}

export function dropPendingTimeouts(): void {
  const abandoned = [...pending.keys()]
  pending.clear()
  for (const handle of abandoned) globalThis.clearTimeout(handle)
}

export const TestOnly = { isOurs }
