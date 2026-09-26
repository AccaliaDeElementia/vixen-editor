'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { cast } from '../cast.ts'

import { readJson, writeJson } from '../../src/client/local-storage.ts'

const KEY = 'vixen-editor:probe'

function blockedStorage(): Storage {
  return cast<Storage>({
    getItem: () => {
      throw new Error('access denied')
    },
    setItem: () => {
      throw new Error('quota exceeded')
    },
  })
}

beforeEach(() => {
  localStorage.clear()
})

describe('readJson', () => {
  it('round-trips a value through storage', () => {
    writeJson(KEY, { kept: true })

    expect(readJson(KEY)).toStrictEqual({ kept: true })
  })

  it('reads null when the key was never written', () => {
    expect(readJson(KEY)).toBeNull()
  })

  it('reads null rather than throwing on malformed JSON', () => {
    localStorage.setItem(KEY, '{ not json')

    expect(readJson(KEY)).toBeNull()
  })

  it('reads null when storage itself is unavailable', () => {
    expect(readJson(KEY, null)).toBeNull()
  })

  it('survives storage that throws on access, which is what blocked site data does', () => {
    expect(readJson(KEY, blockedStorage())).toBeNull()
  })
})

describe('writeJson', () => {
  it('does nothing when storage is unavailable, rather than failing the caller', () => {
    expect(() => {
      writeJson(KEY, { kept: true }, null)
    }).not.toThrow()
  })

  it('survives a full quota, because a lost preference beats a broken editor', () => {
    expect(() => {
      writeJson(KEY, { kept: true }, blockedStorage())
    }).not.toThrow()
  })
})
