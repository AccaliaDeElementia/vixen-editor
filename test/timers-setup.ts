'use sanity'

import { afterEach } from 'vitest'

import { failOnLeakedInterval, failOnLeakedTimeout, watchIntervals, watchTimeouts } from './timers.ts'
import { failOnOutput, watchConsole, watchOutput } from './noise.ts'

watchIntervals()
watchTimeouts()
watchOutput()
watchConsole()

afterEach(() => {
  failOnLeakedInterval()
  failOnLeakedTimeout()
  failOnOutput()
})
