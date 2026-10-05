'use sanity'

import { afterEach } from 'vitest'

import { failOnLeakedInterval, failOnLeakedTimeout, watchIntervals, watchTimeouts } from './timers.ts'

watchIntervals()
watchTimeouts()

afterEach(() => {
  failOnLeakedInterval()
  failOnLeakedTimeout()
})
