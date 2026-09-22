'use sanity'

import path from 'node:path'

import { extensionOf } from './safe-path.ts'

function seed(name: string): string {
  return `# ${name}\n\nTODO: start writing.\n`
}

export function seedDocument(id: string): string {
  const base = path.posix.basename(id)

  return seed(base.slice(0, base.length - extensionOf(base).length))
}

export function seedFolderIndex(folderPath: string): string {
  return seed(path.posix.basename(folderPath))
}
