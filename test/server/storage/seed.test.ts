'use sanity'

import { describe, expect, it } from 'vitest'

import { seedDocument, seedFolderIndex } from '../../../src/server/storage/seed.ts'

describe('seedDocument', () => {
  it.each([
    ['a flat markdown file', 'notes.md', 'notes'],
    ['a nested file', 'journal/2026/september.md', 'september'],
    ['a plain text file', 'notes.txt', 'notes'],
    ['a name containing dots', 'release.notes.md', 'release.notes'],
    ['an uppercase extension', 'NOTES.MD', 'NOTES'],
  ])('heads %s with the name minus its extension', (_label, id, heading) => {
    expect(seedDocument(id)).toBe(`# ${heading}\n\nTODO: start writing.\n`)
  })
})

describe('seedFolderIndex', () => {
  it.each([
    ['a flat folder', 'journal', 'journal'],
    ['a nested folder', 'journal/2026', '2026'],
  ])('heads %s with the folder name', (_label, folderPath, heading) => {
    expect(seedFolderIndex(folderPath)).toBe(`# ${heading}\n\nTODO: start writing.\n`)
  })

  it('keeps a dot in a folder name, which is part of the name and not an extension', () => {
    expect(seedFolderIndex('releases/v1.2')).toContain('# v1.2')
  })
})

describe('seeded content', () => {
  it.each([
    ['a document', seedDocument('notes.md')],
    ['a folder index', seedFolderIndex('journal')],
  ])('leaves %s non-blank, so it survives the rule against empty saves', (_label, content) => {
    expect(content.trim()).not.toBe('')
  })
})
