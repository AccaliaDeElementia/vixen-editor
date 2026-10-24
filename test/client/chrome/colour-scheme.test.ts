'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { cast } from '../../cast.ts'
import { given } from '../../conditions.ts'

import { followColourScheme } from '../../../src/client/chrome/colour-scheme.ts'

const LOCK_SELECTOR = 'meta[name="darkreader-lock"]'

interface Device {
  view: Window
  prefersLight: (light: boolean) => void
  watchers: () => number
  asked: () => string
}

let head: HTMLElement = document.createElement('head')

function locks(): number {
  return head.querySelectorAll(LOCK_SELECTOR).length
}

function device(light: boolean): Device {
  const watching = new Set<EventListener>()
  const asked: string[] = []
  const query = {
    matches: light,
    addEventListener: (_type: string, listener: EventListener) => watching.add(listener),
    removeEventListener: (_type: string, listener: EventListener) => watching.delete(listener),
  }

  return {
    view: cast<Window>({
      matchMedia: (media: string) => {
        asked.push(media)
        return query
      },
    }),
    prefersLight: (wants: boolean) => {
      query.matches = wants
      for (const listener of watching) listener(new Event('change'))
    },
    watchers: () => watching.size,
    asked: () => asked.join(' '),
  }
}

beforeEach(() => {
  head = document.createElement('head')
})

describe('telling an extension the page is already dark', () => {
  it('locks the head when the device asks for dark', () => {
    followColourScheme(device(false).view, head)

    expect(locks()).toBe(1)
  })

  it('asks only whether the device wants light, so one that states no preference gets the dark page', () => {
    const screen = device(false)

    followColourScheme(screen.view, head)

    expect(screen.asked()).toBe('(prefers-color-scheme: light)')
  })

  it('leaves the head alone when the device asks for light, so the extension has nothing to do', () => {
    followColourScheme(device(true).view, head)

    expect(locks()).toBe(0)
  })

  it('takes the lock away when the device turns light while the page is open', () => {
    const screen = device(false)
    followColourScheme(screen.view, head)

    screen.prefersLight(true)

    expect(locks()).toBe(0)
  })

  it('puts the lock back when the device turns dark again', () => {
    const screen = device(true)
    followColourScheme(screen.view, head)

    screen.prefersLight(false)

    expect(locks()).toBe(1)
  })

  it('leaves only one lock behind when the device flips back and forth', () => {
    const screen = device(false)
    followColourScheme(screen.view, head)

    screen.prefersLight(true)
    screen.prefersLight(false)
    screen.prefersLight(false)

    expect(locks()).toBe(1)
  })

  it('stops watching the device once the layout is torn down', () => {
    const screen = device(false)
    const stopFollowing = followColourScheme(screen.view, head)
    given(() => {
      expect(screen.watchers()).toBe(1)
    })

    stopFollowing()

    expect(screen.watchers()).toBe(0)
  })
})
