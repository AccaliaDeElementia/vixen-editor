'use sanity'

import { describe, expect, it } from 'vitest'

import { createLogger, loggerNamespace } from '../../src/server/logging.ts'

describe('loggerNamespace', () => {
  it('scopes a module under the project root', () => {
    expect(loggerNamespace('app')).toBe('vixen-editor:app')
  })

  it('appends an optional function name', () => {
    expect(loggerNamespace('app', 'onError')).toBe('vixen-editor:app:onError')
  })

  it('keeps a nested module path readable', () => {
    expect(loggerNamespace('storage/fs-store', 'write')).toBe('vixen-editor:storage/fs-store:write')
  })
})

describe('createLogger', () => {
  it('returns a callable logger', () => {
    expect(typeof createLogger('app')).toBe('function')
  })

  it('carries the scoped namespace, so DEBUG can filter on it', () => {
    expect(createLogger('storage/fs-store', 'write').namespace).toBe('vixen-editor:storage/fs-store:write')
  })

  it('is disabled unless DEBUG opts the namespace in', () => {
    expect(createLogger('app', 'onError').enabled).toBe(false)
  })

  it('writes nothing when disabled', () => {
    const log = createLogger('app', 'quiet')
    log('this must not reach any stream %o', { secret: 'value' })

    expect(log.enabled).toBe(false)
  })
})
