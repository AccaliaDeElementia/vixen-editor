'use sanity'

export const STORE_ROOT = ''

export function joinPath(directory: string, name: string): string {
  return directory === STORE_ROOT ? name : `${directory}/${name}`
}
