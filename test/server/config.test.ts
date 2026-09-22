'use sanity'

import { describe, expect, it } from 'vitest'

import { ConfigError, loadConfig } from '../../server/config.ts'

describe('loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    const config = loadConfig({})

    expect(config).toStrictEqual({
      port: 3000,
      host: '0.0.0.0',
      docsRoot: './data/docs',
      logLevel: 'info',
      nodeEnv: 'development',
    })
  })

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      HOST: '127.0.0.1',
      DOCS_ROOT: '/data/docs',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'production',
    })

    expect(config).toStrictEqual({
      port: 8080,
      host: '127.0.0.1',
      docsRoot: '/data/docs',
      logLevel: 'debug',
      nodeEnv: 'production',
    })
  })

  it('coerces PORT to a number', () => {
    expect(loadConfig({ PORT: '5173' }).port).toBe(5173)
  })

  it.each([
    ['not-a-number', 'abc'],
    ['zero', '0'],
    ['negative', '-1'],
    ['above the valid port range', '70000'],
    ['fractional', '80.5'],
  ])('rejects a PORT that is %s', (_label, port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(ConfigError)
  })

  it('names the offending variable in the error message', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/)
  })

  it('rejects an unknown LOG_LEVEL', () => {
    expect(() => loadConfig({ LOG_LEVEL: 'verbose' })).toThrow(ConfigError)
  })

  it('rejects an unknown NODE_ENV', () => {
    expect(() => loadConfig({ NODE_ENV: 'staging' })).toThrow(ConfigError)
  })

  it('rejects an empty DOCS_ROOT', () => {
    expect(() => loadConfig({ DOCS_ROOT: '' })).toThrow(ConfigError)
  })

  it('reports every invalid variable at once', () => {
    expect(() => loadConfig({ PORT: 'abc', LOG_LEVEL: 'verbose' })).toThrow(/PORT[\s\S]*LOG_LEVEL/)
  })

  it('defaults to process.env when called with no argument', () => {
    expect(() => loadConfig()).not.toThrow()
  })
})
