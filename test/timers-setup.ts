'use sanity'

import { afterEach } from 'vitest'

import { failOnLeakedInterval, failOnLeakedTimeout, watchIntervals, watchTimeouts } from './timers.ts'
import { failOnOutput, watchOutput } from './noise.ts'

watchIntervals()
watchTimeouts()
watchOutput()

afterEach(() => {
  failOnLeakedInterval()
  failOnLeakedTimeout()
  failOnOutput()
})
