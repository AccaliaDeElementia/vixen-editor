'use sanity'

import { afterEach, beforeEach, vi } from 'vitest'

import { failOnLeakedInterval, failOnLeakedTimeout, watchIntervals, watchTimeouts } from '../timers.ts'
import { cast } from '../cast.ts'

import { closeTrees } from './tree-fixtures.ts'
import { closeEditors } from './editor-fixtures.ts'
import { failOnLeakedListener, watchListeners } from './listeners.ts'

function channelHappyDomDoesNotProvide(): EventSource {
  return cast<EventSource>({
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    close: () => undefined,
  })
}

beforeEach(() => {
  vi.stubGlobal('EventSource', channelHappyDomDoesNotProvide)
  window.history.replaceState(null, '', '/')
})

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
