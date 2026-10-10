'use sanity'

import { describe, expect, it } from 'vitest'

import { nullWhenAbsent } from '../../../src/server/storage/absence.ts'

const RESULT = 'what the operation returned'

function failingWith(code: string): () => Promise<never> {
  return async () => {
    const error: NodeJS.ErrnoException = new Error(`refused with ${code}`)
    error.code = code

    return await Promise.reject(error)
  }
}

describe('nullWhenAbsent', () => {
  it('hands back what the operation returned when it succeeded', async () => {
    expect(await nullWhenAbsent(async () => await Promise.resolve(RESULT))).toBe(RESULT)
  })

  it('answers null when the path was simply not there', async () => {
    expect(await nullWhenAbsent(failingWith('ENOENT'))).toBeNull()
  })

  it('answers null when a parent of the path is not a directory, which is the same absence', async () => {
    expect(await nullWhenAbsent(failingWith('ENOTDIR'))).toBeNull()
  })

  it('rethrows a failure that is not an absence, so a real fault is not read as an empty result', async () => {
    await expect(nullWhenAbsent(failingWith('EACCES'))).rejects.toThrow('refused with EACCES')
  })

  it('rethrows an error carrying no code at all', async () => {
    await expect(nullWhenAbsent(async () => await Promise.reject(new Error('no code')))).rejects.toThrow('no code')
  })
})
