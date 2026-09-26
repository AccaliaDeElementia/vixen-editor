'use sanity'

import { describe, expect, it } from 'vitest'

import {
  FOLDER_INDEX_NAME,
  UPLOAD_EXTENSIONS,
  classifyFile,
  extensionOf,
  isEntryKind,
} from '../../src/shared/documents.ts'

describe('isEntryKind', () => {
  it.each([['document'], ['image'], ['folder']])('accepts %s, which the store can hold', (value) => {
    expect(isEntryKind(value)).toBe(true)
  })

  it.each([
    ['a kind the store does not have', 'symlink'],
    ['the empty string', ''],
    ['a number', 1],
    ['null', null],
    ['undefined', undefined],
    ['an object', {}],
  ])('rejects %s', (_label, value) => {
    expect(isEntryKind(value)).toBe(false)
  })
})

describe('FOLDER_INDEX_NAME', () => {
  it('is the document a folder url resolves to, and the one a new folder is seeded with', () => {
    expect(FOLDER_INDEX_NAME).toBe('index.md')
  })
})

describe('extensionOf', () => {
  it.each([
    ['notes.md', '.md'],
    ['photo.PNG', '.png'],
    ['journal/2026/a.txt', '.txt'],
    ['archive.tar.gz', '.gz'],
    ['release.notes.md', '.md'],
    ['Notes.Md', '.md'],
    ['no-extension', ''],
    ['.hidden', ''],
    ['v1.2/notes', ''],
    ['', ''],
  ])('reads %j as %j', (value, expected) => {
    expect(extensionOf(value)).toBe(expected)
  })

  it('ignores a dot in a parent directory, which is a folder name and not an extension', () => {
    expect(extensionOf('v1.2/notes')).toBe('')
  })
})

describe('classifyFile', () => {
  it.each([
    ['notes.md', 'document'],
    ['notes.txt', 'document'],
    ['photo.png', 'image'],
    ['photo.svg', 'image'],
    ['PHOTO.JPEG', 'image'],
    ['archive.zip', null],
    ['journal', null],
    ['README', null],
  ])('classifies %s as %s', (name, expected) => {
    expect(classifyFile(name)).toBe(expected)
  })

  it('agrees that every uploadable extension is one kind or the other', () => {
    expect(UPLOAD_EXTENSIONS.filter((extension) => classifyFile(`file${extension}`) === null)).toStrictEqual([])
  })
})
