'use sanity'

import { z } from 'zod'

const DEFAULT_PORT = 3000
const MIN_PORT = 1
const MAX_PORT = 65535

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export const NODE_ENVS = ['development', 'production', 'test'] as const

export type LogLevel = (typeof LOG_LEVELS)[number]
export type NodeEnv = (typeof NODE_ENVS)[number]

export interface Config {
  port: number
  host: string
  docsRoot: string
  templatesDir: string
  logLevel: LogLevel
  nodeEnv: NodeEnv
}

export class ConfigError extends Error {
  override readonly name = 'ConfigError'
}

const envSchema = z.object({
  PORT: z.coerce.number().int().min(MIN_PORT).max(MAX_PORT).default(DEFAULT_PORT),
  HOST: z.string().min(1).default('0.0.0.0'),
  DOCS_ROOT: z.string().min(1).default('./data/docs'),
  TEMPLATES_DIR: z.string().min(1).default('./src/templates'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  NODE_ENV: z.enum(NODE_ENVS).default('development'),
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
  }
}
