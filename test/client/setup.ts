'use sanity'

import { afterEach } from 'vitest'

import { failOnLeakedInterval, watchIntervals } from '../timers.ts'

import { closeEditors } from './editor-fixtures.ts'
import { failOnLeakedListener, watchListeners } from './listeners.ts'

watchIntervals()
watchListeners()

afterEach(() => {
  closeEditors()
  failOnLeakedInterval()
  failOnLeakedListener()
})
