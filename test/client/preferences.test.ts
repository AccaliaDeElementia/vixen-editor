'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_PREFERENCES,
  PREFERENCES_KEY,
  readPreferences,
  writePreferences,
} from '../../src/client/layout/preferences.ts'

function storageHolding(raw: string | null): Storage {
  return { getItem: () => raw, setItem: () => undefined } as unknown as Storage
}

function throwingStorage(): Storage {
  return {
    getItem: () => {
      throw new Error('access denied')
    },
    setItem: () => {
      throw new Error('quota exceeded')
    },
  } as unknown as Storage
}

beforeEach(() => {
  localStorage.clear()
})

describe('readPreferences', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(readPreferences(storageHolding(null))).toStrictEqual(DEFAULT_PREFERENCES)
  })

  it('defaults to open with no custom width', () => {
    expect(DEFAULT_PREFERENCES).toStrictEqual({ widthPx: null, open: true, openFolders: [] })
  })

  it('round-trips a stored value', () => {
    writePreferences({ widthPx: 420, open: false, openFolders: ['journal'] })

    expect(readPreferences()).toStrictEqual({ widthPx: 420, open: false, openFolders: ['journal'] })
  })

  it('survives storage that throws on read, as in private browsing', () => {
    expect(readPreferences(throwingStorage())).toStrictEqual(DEFAULT_PREFERENCES)
  })

  it('survives storage being unavailable entirely', () => {
    expect(readPreferences(null)).toStrictEqual(DEFAULT_PREFERENCES)
  })

  it('survives even reaching for localStorage throwing, as when site data is blocked', () => {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('site data blocked')
      },
    })

    try {
      expect(readPreferences()).toStrictEqual(DEFAULT_PREFERENCES)
      expect(() => {
        writePreferences({ widthPx: 300, open: true, openFolders: [] })
      }).not.toThrow()
    } finally {
      if (original !== undefined) Object.defineProperty(globalThis, 'localStorage', original)
    }
  })

  it.each([
    ['malformed json', 'not json at all'],
    ['a json primitive', '42'],
    ['a json string', '"hello"'],
    ['json null', 'null'],
    ['an array', '[1,2,3]'],
    ['an empty object', '{}'],
    ['a wrong-typed open flag', '{"widthPx":300,"open":"yes"}'],
    ['a wrong-typed width', '{"widthPx":"300","open":true}'],
  ])('falls back to defaults for %s', (_label, raw) => {
    expect(readPreferences(storageHolding(raw))).toStrictEqual(DEFAULT_PREFERENCES)
  })

  it.each([
    ['negative', -50],
    ['zero', 0],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
  ])('rejects a %s width and keeps the rest of the record', (_label, widthPx) => {
    const raw = JSON.stringify({ widthPx, open: false })

    expect(readPreferences(storageHolding(raw))).toStrictEqual({ widthPx: null, open: false, openFolders: [] })
  })

  it('defaults a wrong-typed folder list without discarding the rest of the record', () => {
    const raw = '{"widthPx":300,"open":true,"openFolders":"journal"}'

    expect(readPreferences(storageHolding(raw))).toStrictEqual({ widthPx: 300, open: true, openFolders: [] })
  })

  it('keeps only the strings from a folder list holding junk', () => {
    const raw = JSON.stringify({ widthPx: null, open: true, openFolders: ['journal', 42, null, 'archive'] })

    expect(readPreferences(storageHolding(raw)).openFolders).toStrictEqual(['journal', 'archive'])
  })

  it('keeps an implausibly large width for the caller to clamp', () => {
    // Discarding it would throw away intent; a width saved on a wide monitor is
    // indistinguishable from a bogus one, and both want clamping to the viewport.
    const raw = JSON.stringify({ widthPx: 99999, open: true })

    expect(readPreferences(storageHolding(raw))).toStrictEqual({ widthPx: 99999, open: true, openFolders: [] })
  })
})

describe('writePreferences', () => {
  it('stores under the agreed key', () => {
    writePreferences({ widthPx: 300, open: true, openFolders: [] })

    expect(localStorage.getItem(PREFERENCES_KEY)).toBe(JSON.stringify({ widthPx: 300, open: true, openFolders: [] }))
  })

  it('survives storage that throws, so a full quota costs a preference and not the app', () => {
    expect(() => {
      writePreferences({ widthPx: 300, open: true, openFolders: [] }, throwingStorage())
    }).not.toThrow()
  })

  it('survives storage being unavailable entirely', () => {
    expect(() => {
      writePreferences({ widthPx: 300, open: true, openFolders: [] }, null)
    }).not.toThrow()
  })

  it('defaults to localStorage and not sessionStorage, so preferences outlive the tab', () => {
    sessionStorage.clear()

    writePreferences({ widthPx: 256, open: true, openFolders: [] })

    expect(localStorage.getItem(PREFERENCES_KEY)).not.toBeNull()
    expect(sessionStorage.getItem(PREFERENCES_KEY)).toBeNull()
  })
})
