'use sanity'

import { afterEach } from 'vitest'

import { failOnLeakedInterval, failOnLeakedTimeout, watchIntervals, watchTimeouts } from '../timers.ts'

import { closeTrees } from './tree-fixtures.ts'
import { closeEditors } from './editor-fixtures.ts'
import { failOnLeakedListener, watchListeners } from './listeners.ts'

watchIntervals()
watchTimeouts()
watchListeners()

afterEach(() => {
  closeEditors()
  closeTrees()
  failOnLeakedInterval()
  failOnLeakedListener()
  failOnLeakedTimeout()
})
