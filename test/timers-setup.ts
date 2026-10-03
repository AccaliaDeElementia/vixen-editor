'use sanity'

import { afterEach } from 'vitest'

import { dropPendingTimeouts, failOnLeakedInterval, watchIntervals, watchTimeouts } from './timers.ts'

watchIntervals()
watchTimeouts()

afterEach(() => {
  failOnLeakedInterval()
  dropPendingTimeouts()
})
