'use sanity'

import { afterEach } from 'vitest'

import { failOnLeakedInterval, watchIntervals } from './timers.ts'

watchIntervals()

afterEach(failOnLeakedInterval)
