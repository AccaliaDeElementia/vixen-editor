'use sanity'

import { readPreferences, writePreferences } from '../layout/preferences.ts'

export function readOpenFolders(): Set<string> {
  return new Set(readPreferences().openFolders)
}

function writeOpenFolders(open: Iterable<string>): void {
  writePreferences({ ...readPreferences(), openFolders: [...open].sort((a, b) => a.localeCompare(b)) })
}

export function setFolderOpen(folderPath: string, open: boolean): void {
  const folders = readOpenFolders()

  if (open) folders.add(folderPath)
  else folders.delete(folderPath)

  writeOpenFolders(folders)
}

export function openFolders(paths: Iterable<string>): void {
  const folders = readOpenFolders()
  for (const entryPath of paths) folders.add(entryPath)

  writeOpenFolders(folders)
}

// Folders get deleted and renamed while their paths sit in storage, so the set
// is reconciled against the tree on load rather than growing without bound.
export function pruneOpenFolders(known: readonly string[]): Set<string> {
  const survivors = new Set([...readOpenFolders()].filter((entryPath) => known.includes(entryPath)))
  writeOpenFolders(survivors)

  return survivors
}
