'use sanity'

import { z } from 'zod'

import { DEFAULT_WRITE_LOCK_TIMEOUT_MS } from './storage/lock.ts'

const DEFAULT_PORT = 3000
const MIN_PORT = 1
const MAX_PORT = 65535

// A waiter that gives up this fast turns ordinary concurrency into 503s. The
// lock is still correct below it; it just stops being worth waiting on.
const MIN_WRITE_LOCK_TIMEOUT_MS = 250

// Past a client's own timeout the 503 can never be delivered, so a waiter
// beyond this is held for a response nobody is left to receive — and a wedged
// write becomes a spinner instead of an error.
const MAX_WRITE_LOCK_TIMEOUT_MS = 60_000
const MEBIBYTE = 1_048_576
const DEFAULT_UPLOAD_MEBIBYTES = 25
const DEFAULT_ARCHIVE_MEBIBYTES = 100

export interface Limits {
  uploadMaxBytes: number
  archiveMaxBytes: number
  archiveMaxEntries: number
}

export const DEFAULT_LIMITS: Limits = {
  uploadMaxBytes: DEFAULT_UPLOAD_MEBIBYTES * MEBIBYTE,
  archiveMaxBytes: DEFAULT_ARCHIVE_MEBIBYTES * MEBIBYTE,
  archiveMaxEntries: 2000,
}

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
const NODE_ENVS = ['development', 'production', 'test'] as const

type LogLevel = (typeof LOG_LEVELS)[number]
type NodeEnv = (typeof NODE_ENVS)[number]

export interface Config {
  port: number
  host: string
  docsRoot: string
  templatesDir: string
  logLevel: LogLevel
  nodeEnv: NodeEnv
  writeLockTimeoutMs: number
  limits: Limits
}

class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(MIN_PORT).max(MAX_PORT).default(DEFAULT_PORT),
  HOST: z.string().min(1).default('0.0.0.0'),
  DOCS_ROOT: z.string().min(1).default('./data/docs'),
  TEMPLATES_DIR: z.string().min(1).default('./src/templates'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
  WRITE_LOCK_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .min(MIN_WRITE_LOCK_TIMEOUT_MS)
    .max(MAX_WRITE_LOCK_TIMEOUT_MS)
    .default(DEFAULT_WRITE_LOCK_TIMEOUT_MS),
  UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(DEFAULT_LIMITS.uploadMaxBytes),
  ARCHIVE_MAX_BYTES: z.coerce.number().int().positive().default(DEFAULT_LIMITS.archiveMaxBytes),
  ARCHIVE_MAX_ENTRIES: z.coerce.number().int().positive().default(DEFAULT_LIMITS.archiveMaxEntries),
})

function describeIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`).join('\n')
}

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(env)

  if (!result.success) {
    throw new ConfigError(`Invalid environment configuration:\n${describeIssues(result.error)}`)
  }

  return {
    port: result.data.PORT,
    host: result.data.HOST,
    docsRoot: result.data.DOCS_ROOT,
    templatesDir: result.data.TEMPLATES_DIR,
    logLevel: result.data.LOG_LEVEL,
    nodeEnv: result.data.NODE_ENV,
    writeLockTimeoutMs: result.data.WRITE_LOCK_TIMEOUT_MS,
    limits: {
      uploadMaxBytes: result.data.UPLOAD_MAX_BYTES,
      archiveMaxBytes: result.data.ARCHIVE_MAX_BYTES,
      archiveMaxEntries: result.data.ARCHIVE_MAX_ENTRIES,
    },
  }
}

export const TestOnly = { ConfigError }
