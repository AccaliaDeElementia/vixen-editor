'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { readKeptTabs, writeKeptTabs, TestOnly } from '../../../src/client/layout/kept-tabs.ts'

const { KEPT_TABS_KEY } = TestOnly

const EDITING = { path: 'journal/a.md', view: 'editor' } as const
const PREVIEWING = { path: 'notes.md', view: 'markup' } as const

function stored(value: unknown): void {
  localStorage.setItem(KEPT_TABS_KEY, JSON.stringify(value))
}

beforeEach(() => {
  localStorage.clear()
})

describe('reading the tabs a reader chose to keep', () => {
  it('finds none before anything has been kept', () => {
    expect(readKeptTabs()).toStrictEqual([])
  })

  it('gives them back in the order they were written, which is the order the reader put them in', () => {
    writeKeptTabs([PREVIEWING, EDITING])

    expect(readKeptTabs()).toStrictEqual([PREVIEWING, EDITING])
  })

  it('ignores a stored value that is not a list', () => {
    stored({ notAList: true })

    expect(readKeptTabs()).toStrictEqual([])
  })

  it('drops an entry that is not an object', () => {
    stored(['rubbish', EDITING])

    expect(readKeptTabs()).toStrictEqual([EDITING])
  })

  it('drops an entry with no path to open', () => {
    stored([{ path: '', view: 'editor' }, EDITING])

    expect(readKeptTabs()).toStrictEqual([EDITING])
  })

  it('drops an entry naming a view type this build does not have', () => {
    stored([{ path: 'notes.md', view: 'hologram' }, EDITING])

    expect(readKeptTabs()).toStrictEqual([EDITING])
  })
})

describe('writing the tabs a reader chose to keep', () => {
  it('writes the whole list, so the last window to write wins rather than interleaving with another', () => {
    writeKeptTabs([EDITING])

    writeKeptTabs([PREVIEWING])

    expect(readKeptTabs()).toStrictEqual([PREVIEWING])
  })

  it('keeps nothing when the list is empty, so closing the last tab clears the record', () => {
    writeKeptTabs([EDITING])

    writeKeptTabs([])

    expect(readKeptTabs()).toStrictEqual([])
  })
})
