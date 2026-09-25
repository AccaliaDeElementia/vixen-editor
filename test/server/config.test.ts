'use sanity'

import { describe, expect, it } from 'vitest'

import { DEFAULT_LIMITS, loadConfig, TestOnly } from '../../src/server/config.ts'
import { DEFAULT_WRITE_LOCK_TIMEOUT_MS } from '../../src/server/storage/lock.ts'

const { ConfigError } = TestOnly

describe('loadConfig', () => {
  it('applies defaults when the environment is empty', () => {
    const config = loadConfig({})

    expect(config).toStrictEqual({
      port: 3000,
      host: '0.0.0.0',
      docsRoot: './data/docs',
      templatesDir: './src/templates',
      logLevel: 'info',
      nodeEnv: 'development',
      writeLockTimeoutMs: DEFAULT_WRITE_LOCK_TIMEOUT_MS,
      limits: DEFAULT_LIMITS,
    })
  })

  it('reads overrides from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      HOST: '127.0.0.1',
      DOCS_ROOT: '/data/docs',
      TEMPLATES_DIR: '/srv/templates',
      LOG_LEVEL: 'debug',
      NODE_ENV: 'production',
      UPLOAD_MAX_BYTES: '1048576',
      ARCHIVE_MAX_BYTES: '2097152',
      ARCHIVE_MAX_ENTRIES: '7',
      WRITE_LOCK_TIMEOUT_MS: '250',
    })

    expect(config).toStrictEqual({
      port: 8080,
      host: '127.0.0.1',
      docsRoot: '/data/docs',
      templatesDir: '/srv/templates',
      logLevel: 'debug',
      nodeEnv: 'production',
      writeLockTimeoutMs: 250,
      limits: { uploadMaxBytes: 1048576, archiveMaxBytes: 2097152, archiveMaxEntries: 7 },
    })
  })

  it.each([
    ['zero', '0'],
    ['negative', '-1'],
    ['fractional', '1.5'],
    ['not a number', 'plenty'],
  ])('rejects a %s limit rather than silently disabling the cap', (_label, value) => {
    expect(() => loadConfig({ UPLOAD_MAX_BYTES: value })).toThrow(ConfigError)
    expect(() => loadConfig({ ARCHIVE_MAX_BYTES: value })).toThrow(ConfigError)
    expect(() => loadConfig({ ARCHIVE_MAX_ENTRIES: value })).toThrow(ConfigError)
    expect(() => loadConfig({ WRITE_LOCK_TIMEOUT_MS: value })).toThrow(ConfigError)
  })

  it.each([
    ['1ms, which turns ordinary concurrency into a stream of 503s', '1'],
    ['just under the floor', '249'],
  ])('rejects a timeout of %s', (_label, value) => {
    expect(() => loadConfig({ WRITE_LOCK_TIMEOUT_MS: value })).toThrow(ConfigError)
  })

  it.each([
    ['just over the ceiling', '60001'],
    ['an hour', '3600000'],
  ])('rejects a timeout of %s', (_label, value) => {
    expect(() => loadConfig({ WRITE_LOCK_TIMEOUT_MS: value })).toThrow(ConfigError)
  })

  it.each([
    ['the floor', '250', 250],
    ['the ceiling', '60000', 60000],
  ])('accepts %s itself', (_label, value, expected) => {
    expect(loadConfig({ WRITE_LOCK_TIMEOUT_MS: value }).writeLockTimeoutMs).toBe(expected)
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
