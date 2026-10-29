'use sanity'

import { describe, expect, it } from 'vitest'

import { neutralNameOf, platformOf, TestOnly } from '../../../src/client/platform/key-spelling.ts'

const { nameOfKey, spellingsFor } = TestOnly

const REDO = [{ key: 'Mod-y', mac: 'Mod-Shift-z' }, { linux: 'Ctrl-Shift-z' }]
const DESKTOP_TOUCH = 0
const TABLET_TOUCH = 5
const MOST_A_DESKTOP_REPORTS = 2

function agent({ platform = '', userAgent = '', vendor = '', maxTouchPoints = DESKTOP_TOUCH } = {}): {
  platform: string
  userAgent: string
  vendor: string
  maxTouchPoints: number
} {
  return { platform, userAgent, vendor, maxTouchPoints }
}

describe('the platform a reader is on', () => {
  it.each([
    ['MacIntel', 'mac'],
    ['Win32', 'win'],
    ['Linux x86_64', 'linux'],
    ['X11', 'linux'],
    ['Something else', 'key'],
  ])('reads %s as %s', (platform, expected) => {
    expect(platformOf(agent({ platform }))).toBe(expected)
  })

  it('reads a handheld Apple device as a Mac, since that is what decides the modifier', () => {
    const handheld = agent({ platform: 'iPhone', vendor: 'Apple Computer, Inc.', userAgent: 'Mobile/15E148' })

    expect(platformOf(handheld)).toBe('mac')
  })

  it('reads an Apple tablet claiming to be a desktop as a Mac, by how many fingers it takes', () => {
    const tablet = agent({ platform: 'iPad', vendor: 'Apple Computer, Inc.', maxTouchPoints: TABLET_TOUCH })

    expect(platformOf(tablet)).toBe('mac')
  })

  it('reads an Apple device at the desktop limit of touch points as a desktop, where the editor draws it', () => {
    const desktop = agent({
      platform: 'Unknown',
      vendor: 'Apple Computer, Inc.',
      maxTouchPoints: MOST_A_DESKTOP_REPORTS,
    })

    expect(platformOf(desktop)).toBe('key')
  })

  it('leaves a touchscreen that is not Apple alone', () => {
    const touchy = agent({ platform: 'Win32', vendor: 'Google Inc.', maxTouchPoints: TABLET_TOUCH })

    expect(platformOf(touchy)).toBe('win')
  })
})

describe('which spelling of a chord a platform uses', () => {
  it.each([
    ['mac', ['Mod-Shift-z']],
    ['win', ['Mod-y']],
    ['linux', ['Mod-y', 'Ctrl-Shift-z']],
  ] as const)('gives %s the spellings the keymap gives it', (platform, expected) => {
    expect(spellingsFor(REDO, platform)).toStrictEqual(expected)
  })

  it('falls back to the spelling that names no platform', () => {
    expect(spellingsFor([{ key: 'Mod-s' }], 'win')).toStrictEqual(['Mod-s'])
  })

  it('offers nothing where a chord names only another platform', () => {
    expect(spellingsFor([{ linux: 'Ctrl-Shift-z' }], 'mac')).toStrictEqual([])
  })
})

describe('what a chord is called on screen', () => {
  it.each([
    ['Mod-s', 'mac', 'Cmd + S'],
    ['Mod-s', 'win', 'Ctrl + S'],
    ['Mod-s', 'key', 'Ctrl/Cmd + S'],
    ['Mod-Shift-z', 'mac', 'Cmd + Shift + Z'],
    ['Alt-w', 'win', 'Alt + W'],
    ['Shift-Mod-k', 'win', 'Ctrl + Shift + K'],
    ['Mod-Alt-ArrowUp', 'win', 'Ctrl + Alt + Up arrow'],
    ['Escape', 'win', 'Escape'],
    ['F3', 'win', 'F3'],
    ['Mod-]', 'win', 'Ctrl + ]'],
    ['Cmd-Alt-[', 'mac', 'Cmd + Alt + ['],
    ['Ctrl-Shift-z', 'linux', 'Ctrl + Shift + Z'],
    [' ', 'win', 'Space'],
  ] as const)('writes %s on %s as %s', (spelling, platform, expected) => {
    expect(nameOfKey(spelling, platform)).toBe(expected)
  })
})

describe('what a chord is called where the reader is unknown', () => {
  it('keeps the dual form where every platform presses the same thing', () => {
    expect(neutralNameOf([{ key: 'Mod-s' }])).toBe('Ctrl/Cmd + S')
  })

  it('names the platforms apart where they do not', () => {
    expect(neutralNameOf(REDO)).toBe(
      'Cmd + Shift + Z on macOS, Ctrl + Y on Windows, Ctrl + Y or Ctrl + Shift + Z on Linux',
    )
  })

  it('joins the spellings of one platform with or, since either will do', () => {
    expect(neutralNameOf([{ key: 'Mod-g' }, { key: 'F3' }])).toBe('Ctrl/Cmd + G or F3')
  })
})
