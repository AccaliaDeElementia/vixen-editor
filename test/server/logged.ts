'use sanity'

import { format } from 'node:util'

import { applyDebugFilter } from '../../src/server/platform/logging.ts'

const EVERY_NAMESPACE = 'vixen-editor:*'

export async function loggedDuring(work: () => Promise<void>): Promise<string[]> {
  const { default: createDebug } = await import('debug')
  const { log: original } = createDebug
  const lines: string[] = []

  createDebug.log = (...args: unknown[]): void => {
    lines.push(format(...args))
  }
  applyDebugFilter({ DEBUG: EVERY_NAMESPACE })

  try {
    await work()
  } finally {
    createDebug.log = original
    applyDebugFilter({})
  }

  return lines
}
