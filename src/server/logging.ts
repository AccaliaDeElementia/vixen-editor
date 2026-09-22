'use sanity'

import createDebug from 'debug'
import type { Debugger } from 'debug'

const ROOT_NAMESPACE = 'vixen-editor'

export function loggerNamespace(moduleName: string, functionName?: string): string {
  const scope = functionName === undefined ? moduleName : `${moduleName}:${functionName}`
  return `${ROOT_NAMESPACE}:${scope}`
}

export function createLogger(moduleName: string, functionName?: string): Debugger {
  return createDebug(loggerNamespace(moduleName, functionName))
}

// `debug` decides whether a namespace is on when the logger is created, and
// every logger here is created at module-import time. Anything that changes
// DEBUG later — loading a .env file, most of all — has to re-apply it, or those
// already-created loggers keep the answer they were given at import.
export function applyDebugFilter(env: Record<string, string | undefined> = process.env): void {
  createDebug.enable(env.DEBUG ?? '')
}
