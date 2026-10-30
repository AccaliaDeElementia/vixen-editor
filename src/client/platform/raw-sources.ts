'use sanity'

import { rawUrlFor } from '../../shared/api.ts'
import { directoryOf, isStorePath, resolveDestination } from '../../shared/link-paths.ts'

export function rawSourceFor(holder: string, destination: string): string | null {
  if (!isStorePath(destination)) return null

  const target = resolveDestination(directoryOf(holder), destination)

  return target === null ? null : rawUrlFor(target)
}
