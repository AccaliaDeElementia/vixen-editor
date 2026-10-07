'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { readKeptTabs, writeKeptTabs, TestOnly } from '../../../src/client/layout/kept-tabs.ts'

const { keyFor } = TestOnly
const PANE = 'primary'

const EDITING = { path: 'journal/a.md', view: 'editor' } as const
const PREVIEWING = { path: 'notes.md', view: 'markup' } as const

function stored(value: unknown): void {
  localStorage.setItem(keyFor(PANE), JSON.stringify(value))
}

beforeEach(() => {
  localStorage.clear()
})

describe('reading the tabs a reader chose to keep', () => {
  it('finds none before anything has been kept', () => {
    expect(readKeptTabs(PANE).tabs).toStrictEqual([])
  })

  it('gives them back in the order they were written, which is the order the reader put them in', () => {
    writeKeptTabs(PANE, [PREVIEWING, EDITING], null)

    expect(readKeptTabs(PANE).tabs).toStrictEqual([PREVIEWING, EDITING])
  })

  it('ignores a stored value that is neither a list nor a record of them', () => {
    stored({ notAList: true })

    expect(readKeptTabs(PANE).tabs).toStrictEqual([])
  })

  it('reads a bare list written before the active tab was recorded', () => {
    stored([PREVIEWING, EDITING])

    expect(readKeptTabs(PANE).tabs).toStrictEqual([PREVIEWING, EDITING])
  })

  it('names no active tab for a bare list, because the older record did not have one', () => {
    stored([PREVIEWING, EDITING])

    expect(readKeptTabs(PANE).active).toBeNull()
  })

  it('drops an entry that is not an object', () => {
    stored(['rubbish', EDITING])

    expect(readKeptTabs(PANE).tabs).toStrictEqual([EDITING])
  })

  it('drops an entry with no path to open', () => {
    stored([{ path: '', view: 'editor' }, EDITING])

    expect(readKeptTabs(PANE).tabs).toStrictEqual([EDITING])
  })

  it('drops an entry naming a view type this build does not have', () => {
    stored([{ path: 'notes.md', view: 'hologram' }, EDITING])

    expect(readKeptTabs(PANE).tabs).toStrictEqual([EDITING])
  })
})

describe('writing the tabs a reader chose to keep', () => {
  it('writes the whole list, so the last window to write wins rather than interleaving with another', () => {
    writeKeptTabs(PANE, [EDITING], null)

    writeKeptTabs(PANE, [PREVIEWING], null)

    expect(readKeptTabs(PANE).tabs).toStrictEqual([PREVIEWING])
  })

  it('keeps nothing when the list is empty, so closing the last tab clears the record', () => {
    writeKeptTabs(PANE, [EDITING], null)

    writeKeptTabs(PANE, [], null)

    expect(readKeptTabs(PANE).tabs).toStrictEqual([])
  })
})

describe('the tab a pane was on', () => {
  it('comes back, so a reload shows what the reader was looking at', () => {
    writeKeptTabs(PANE, [PREVIEWING, EDITING], EDITING)

    expect(readKeptTabs(PANE).active).toStrictEqual(EDITING)
  })

  it('is forgotten when the record names one this build cannot show', () => {
    stored({ tabs: [EDITING], active: { path: 'notes.md', view: 'hologram' } })

    expect(readKeptTabs(PANE).active).toBeNull()
  })
})
