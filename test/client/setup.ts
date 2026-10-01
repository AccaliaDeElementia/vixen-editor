'use sanity'

import { afterEach } from 'vitest'

import { failOnLeakedInterval, watchIntervals } from '../timers.ts'

import { closeEditors } from './editor-fixtures.ts'

watchIntervals()

afterEach(() => {
  closeEditors()
  failOnLeakedInterval()
})
