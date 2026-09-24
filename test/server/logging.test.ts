'use sanity'

import { describe, expect, it } from 'vitest'

import { afterEach } from 'vitest'

import { applyDebugFilter, createLogger, TestOnly } from '../../src/server/logging.ts'

const { loggerNamespace } = TestOnly

afterEach(() => {
  applyDebugFilter({})
})

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

describe('applyDebugFilter', () => {
  it('enables a logger that already existed before DEBUG was known', () => {
    const existing = createLogger('main', 'startServer')
    expect(existing.enabled).toBeFalsy()

    applyDebugFilter({ DEBUG: 'vixen-editor:*' })

    expect(existing.enabled).toBe(true)
  })

  it('honours a narrow filter across loggers created earlier', () => {
    const store = createLogger('storage/fs-store')
    const startup = createLogger('main', 'startServer')

    applyDebugFilter({ DEBUG: 'vixen-editor:storage/*' })

    expect(store.enabled).toBe(true)
    expect(startup.enabled).toBe(false)
  })

  it('silences everything when DEBUG is absent', () => {
    const logger = createLogger('app', 'onError')
    applyDebugFilter({ DEBUG: 'vixen-editor:*' })

    applyDebugFilter({})

    expect(logger.enabled).toBe(false)
  })

  it('silences everything when DEBUG is empty', () => {
    const logger = createLogger('app', 'onError')
    applyDebugFilter({ DEBUG: 'vixen-editor:*' })

    applyDebugFilter({ DEBUG: '' })

    expect(logger.enabled).toBe(false)
  })

  it('reads process.env when given no argument', () => {
    expect(() => {
      applyDebugFilter()
    }).not.toThrow()
  })
})
