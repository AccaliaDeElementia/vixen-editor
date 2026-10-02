'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import {
  openFolders,
  pruneOpenFolders,
  readOpenFolders,
  setFolderOpen,
} from '../../../src/client/files/open-folders.ts'
import { readPreferences, writePreferences } from '../../../src/client/layout/preferences.ts'

beforeEach(() => {
  localStorage.clear()
})

describe('readOpenFolders', () => {
  it('starts empty, so the tree opens collapsed', () => {
    expect([...readOpenFolders()]).toStrictEqual([])
  })

  it('returns what was stored', () => {
    writePreferences({ widthPx: null, open: true, openFolders: ['journal'] })

    expect([...readOpenFolders()]).toStrictEqual(['journal'])
  })
})

describe('setFolderOpen', () => {
  it('remembers an opened folder', () => {
    setFolderOpen('journal', true)

    expect([...readOpenFolders()]).toStrictEqual(['journal'])
  })

  it('forgets a closed folder', () => {
    setFolderOpen('journal', true)
    setFolderOpen('journal', false)

    expect([...readOpenFolders()]).toStrictEqual([])
  })

  it('leaves siblings open when one closes', () => {
    setFolderOpen('journal', true)
    setFolderOpen('archive', true)
    setFolderOpen('journal', false)

    expect([...readOpenFolders()]).toStrictEqual(['archive'])
  })

  it('closing a folder that was never open is not an error', () => {
    expect(() => {
      setFolderOpen('journal', false)
    }).not.toThrow()
  })

  it('leaves the explorer width and open state alone', () => {
    writePreferences({ widthPx: 420, open: false, openFolders: [] })

    setFolderOpen('journal', true)

    expect(readPreferences()).toMatchObject({ widthPx: 420, open: false })
  })
})

describe('openFolders', () => {
  it('opens several at once, which is how a document reveals its ancestors', () => {
    openFolders(['journal', 'journal/2026'])

    expect([...readOpenFolders()].sort((a, b) => a.localeCompare(b))).toStrictEqual(['journal', 'journal/2026'])
  })

  it('leaves folders that were already open alone', () => {
    setFolderOpen('archive', true)

    openFolders(['journal'])

    expect([...readOpenFolders()]).toContain('archive')
  })

  it('opening nothing changes nothing', () => {
    setFolderOpen('archive', true)

    openFolders([])

    expect([...readOpenFolders()]).toStrictEqual(['archive'])
  })
})

describe('pruneOpenFolders', () => {
  it('drops a folder the tree no longer has', () => {
    openFolders(['journal', 'deleted'])

    expect([...pruneOpenFolders(['journal'])]).toStrictEqual(['journal'])
  })

  it('persists the pruning, so the set cannot grow without bound', () => {
    openFolders(['journal', 'deleted'])
    pruneOpenFolders(['journal'])

    expect([...readOpenFolders()]).toStrictEqual(['journal'])
  })

  it('keeps every folder the tree still has', () => {
    openFolders(['journal', 'archive'])

    expect([...pruneOpenFolders(['journal', 'archive', 'other'])].sort((a, b) => a.localeCompare(b))).toStrictEqual([
      'archive',
      'journal',
    ])
  })

  it('empties the set when the tree is empty', () => {
    openFolders(['journal'])

    expect([...pruneOpenFolders([])]).toStrictEqual([])
  })
})
