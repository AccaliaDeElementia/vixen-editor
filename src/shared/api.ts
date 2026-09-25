'use sanity'

import { STORE_ROOT } from './store-path.ts'

export const API_PREFIX = '/api'

export function archiveUrlFor(directory: string, baseUrl: string = API_PREFIX): string {
  return directory === STORE_ROOT
    ? `${baseUrl}/files/archive`
    : `${baseUrl}/files/archive?path=${encodeURIComponent(directory)}`
}
