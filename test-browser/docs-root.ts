'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

// One definition, shared by the config that hands it to the server and by the
// setup and teardown that empty it. Two copies of this path is how a cleanup
// silently stops cleaning the directory the suite actually writes to.
export const BROWSER_DOCS_ROOT = path.resolve(import.meta.dirname, '..', 'data', 'browser-test-docs')

export async function entriesInDocsRoot(): Promise<string[]> {
  const entries = await fs.readdir(BROWSER_DOCS_ROOT).catch(() => [])

  return entries.sort((a, b) => a.localeCompare(b))
}

export async function emptyDocsRoot(): Promise<void> {
  await fs.rm(BROWSER_DOCS_ROOT, { recursive: true, force: true })
  await fs.mkdir(BROWSER_DOCS_ROOT, { recursive: true })
}
