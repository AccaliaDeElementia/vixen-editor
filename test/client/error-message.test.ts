'use sanity'

import { describe, expect, it } from 'vitest'

import { errorMessage } from '../../src/client/error-message.ts'

describe('errorMessage', () => {
  it('uses the message of a real error', () => {
    expect(errorMessage(new Error('boom'))).toBe('boom')
  })

  it('falls back for a non-error value', () => {
    expect(errorMessage('a string')).toBe('unknown error')
  })
})
