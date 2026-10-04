'use sanity'

import { describe, expect, it } from 'vitest'

import { parseTrashEntry, pathsUnder } from '../../../src/client/files/trash-entry.ts'

const ENTRY = {
  entry: {
    name: 'journal',
    path: '',
    kind: 'folder',
    restorable: true,
    blockedBy: null,
    children: [
      { name: 'a.md', path: 'a.md', kind: 'document', restorable: true, blockedBy: 'journal/a.md', children: [] },
      {
        name: '2026',
        path: '2026',
        kind: 'folder',
        restorable: true,
        blockedBy: null,
        children: [
          {
            name: 'march.md',
            path: '2026/march.md',
            kind: 'document',
            restorable: false,
            blockedBy: null,
            children: [],
          },
        ],
      },
    ],
  },
}

describe('reading what the server says an entry holds', () => {
  it('keeps the entry itself as the root of the tree', () => {
    expect(parseTrashEntry(ENTRY)).toMatchObject({ name: 'journal', path: '', kind: 'folder' })
  })

  it('keeps what is nested inside it', () => {
    expect(parseTrashEntry(ENTRY)?.children.map((child) => child.name)).toStrictEqual(['a.md', '2026'])
  })

  it('carries whether an item can be put back as it is', () => {
    expect(parseTrashEntry(ENTRY)?.children.at(1)?.children.at(0)?.restorable).toBe(false)
  })

  it('carries what is in the way, so the view can say so', () => {
    expect(parseTrashEntry(ENTRY)?.children.at(0)?.blockedBy).toBe('journal/a.md')
  })

  it('answers nothing for a payload that is not an entry at all', () => {
    expect(parseTrashEntry({ nothing: true })).toBeNull()
  })

  it('drops a child the server described in a way it cannot read', () => {
    const odd = { entry: { ...ENTRY.entry, children: [{ name: 'a.md' }] } }

    expect(parseTrashEntry(odd)?.children).toStrictEqual([])
  })
})

describe('an entry described in a way the client cannot read', () => {
  it('answers nothing when the kind is not one the app knows', () => {
    expect(parseTrashEntry({ entry: { ...ENTRY.entry, kind: 'socket' } })).toBeNull()
  })

  it('answers nothing when nothing says whether it can be put back', () => {
    expect(parseTrashEntry({ entry: { ...ENTRY.entry, restorable: 'yes' } })).toBeNull()
  })

  it('answers nothing for a reply that is not an object at all', () => {
    expect(parseTrashEntry('journal')).toBeNull()
  })

  it('reads an entry whose contents are missing as holding nothing', () => {
    expect(parseTrashEntry({ entry: { ...ENTRY.entry, children: undefined } })?.children).toStrictEqual([])
  })
})

describe('every path at or under a node', () => {
  it('starts with the node itself', () => {
    const entry = parseTrashEntry(ENTRY)

    expect(entry === null ? [] : pathsUnder(entry)).toStrictEqual(['', 'a.md', '2026', '2026/march.md'])
  })
})
