'use sanity'

import { describe, expect, it } from 'vitest'

import { ancestorsOf, folderPathsIn, parseTrash, parseTree } from '../../src/client/files/tree-model.ts'

describe('parseTree', () => {
  it('reads a flat document', () => {
    const tree = parseTree({ tree: [{ name: 'notes.md', path: 'notes.md', kind: 'document' }] })

    expect(tree).toStrictEqual([{ name: 'notes.md', path: 'notes.md', kind: 'document' }])
  })

  it('reads nested folders', () => {
    const tree = parseTree({
      tree: [
        {
          name: 'journal',
          path: 'journal',
          kind: 'folder',
          children: [{ name: 'a.md', path: 'journal/a.md', kind: 'document' }],
        },
      ],
    })

    expect(tree).toStrictEqual([
      {
        name: 'journal',
        path: 'journal',
        kind: 'folder',
        children: [{ name: 'a.md', path: 'journal/a.md', kind: 'document' }],
      },
    ])
  })

  it('keeps an empty folder as a folder with no children', () => {
    const tree = parseTree({ tree: [{ name: 'empty', path: 'empty', kind: 'folder' }] })

    expect(tree).toStrictEqual([{ name: 'empty', path: 'empty', kind: 'folder', children: [] }])
  })

  it('reads an image', () => {
    const tree = parseTree({ tree: [{ name: 'p.png', path: 'p.png', kind: 'image' }] })

    expect(tree[0]?.kind).toBe('image')
  })

  it.each([
    ['a payload that is not an object', 'surprise'],
    ['a payload with no tree', { unexpected: true }],
    ['a tree that is not an array', { tree: 'surprise' }],
    ['null', null],
  ])('returns nothing for %s', (_label, payload) => {
    expect(parseTree(payload)).toStrictEqual([])
  })

  it.each([
    ['an entry that is not an object', 'surprise'],
    ['a missing name', { path: 'a.md', kind: 'document' }],
    ['a missing path', { name: 'a.md', kind: 'document' }],
    ['an unrecognised kind', { name: 'a', path: 'a', kind: 'sandwich' }],
    ['a missing kind', { name: 'a', path: 'a' }],
  ])('drops %s rather than rendering something broken', (_label, entry) => {
    expect(parseTree({ tree: [entry] })).toStrictEqual([])
  })

  it('keeps the good entries alongside a bad one', () => {
    const tree = parseTree({ tree: [{ bad: true }, { name: 'a.md', path: 'a.md', kind: 'document' }] })

    expect(tree).toHaveLength(1)
  })

  it('drops a broken child without losing its parent', () => {
    const tree = parseTree({ tree: [{ name: 'f', path: 'f', kind: 'folder', children: [{ bad: true }] }] })

    expect(tree).toStrictEqual([{ name: 'f', path: 'f', kind: 'folder', children: [] }])
  })
})

describe('parseTrash', () => {
  const entry = { id: 'abc', originalPath: 'notes.md', kind: 'document', deletedAt: '2026-01-01T00:00:00.000Z' }

  it('reads an entry', () => {
    expect(parseTrash({ entries: [entry] })).toStrictEqual([entry])
  })

  it.each([
    ['a payload that is not an object', 'surprise'],
    ['a payload with no entries', { unexpected: true }],
    ['entries that are not an array', { entries: 'surprise' }],
  ])('returns nothing for %s', (_label, payload) => {
    expect(parseTrash(payload)).toStrictEqual([])
  })

  it.each([
    ['a missing id', { ...entry, id: undefined }],
    ['a missing original path', { ...entry, originalPath: undefined }],
    ['a missing deletion time', { ...entry, deletedAt: undefined }],
    ['an unrecognised kind', { ...entry, kind: 'sandwich' }],
    ['an entry that is not an object', 'surprise'],
  ])('drops %s', (_label, bad) => {
    expect(parseTrash({ entries: [bad] })).toStrictEqual([])
  })
})

describe('ancestorsOf', () => {
  it.each([
    ['a nested document', 'journal/2026/september.md', ['journal', 'journal/2026']],
    ['a document one level down', 'journal/a.md', ['journal']],
    ['a document at the root', 'notes.md', []],
    ['a folder', 'journal/2026', ['journal']],
  ])('lists the folders on the way to %s', (_label, entryPath, expected) => {
    expect(ancestorsOf(entryPath)).toStrictEqual(expected)
  })
})

describe('folderPathsIn', () => {
  it('lists every folder, however deep', () => {
    const tree = parseTree({
      tree: [
        {
          name: 'a',
          path: 'a',
          kind: 'folder',
          children: [
            { name: 'b', path: 'a/b', kind: 'folder', children: [] },
            { name: 'x.md', path: 'a/x.md', kind: 'document' },
          ],
        },
        { name: 'y.md', path: 'y.md', kind: 'document' },
      ],
    })

    expect(folderPathsIn(tree)).toStrictEqual(['a', 'a/b'])
  })

  it('lists nothing for a flat tree of documents', () => {
    expect(folderPathsIn(parseTree({ tree: [{ name: 'a.md', path: 'a.md', kind: 'document' }] }))).toStrictEqual([])
  })
})
