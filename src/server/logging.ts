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
