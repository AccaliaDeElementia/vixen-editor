'use sanity'

import { describe, expect, it } from 'vitest'

import { createOpenTabs, tabIdentity } from '../../../src/client/layout/open-tabs.ts'

const EDITING = { path: 'journal/a.md', view: 'editor' } as const
const PREVIEWING = { path: 'journal/a.md', view: 'markup' } as const
const OTHER = { path: 'notes.md', view: 'editor' } as const

describe('what a tab is', () => {
  it('is the same tab when the path and the view agree', () => {
    expect(tabIdentity({ ...EDITING })).toBe(tabIdentity(EDITING))
  })

  it('is a different tab when the view differs, which is what lets a preview sit beside an editor', () => {
    expect(tabIdentity(PREVIEWING)).not.toBe(tabIdentity(EDITING))
  })
})

describe('the set of open tabs', () => {
  it('starts empty', () => {
    expect(createOpenTabs().all()).toStrictEqual([])
  })

  it('has nothing active before anything opens', () => {
    expect(createOpenTabs().active()).toBeNull()
  })

  it('holds what was opened', () => {
    const tabs = createOpenTabs()

    tabs.open(EDITING)

    expect(tabs.all()).toStrictEqual([EDITING])
  })

  it('makes what was opened the active one', () => {
    const tabs = createOpenTabs()

    tabs.open(EDITING)

    expect(tabs.active()).toStrictEqual(EDITING)
  })

  it('keeps the order things were opened in, which is the reader’s order', () => {
    const tabs = createOpenTabs()

    tabs.open(EDITING)
    tabs.open(OTHER)

    expect(tabs.all()).toStrictEqual([EDITING, OTHER])
  })

  it('raises a tab it already holds rather than opening a second', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)
    tabs.open(OTHER)

    tabs.open({ ...EDITING })

    expect(tabs.all()).toStrictEqual([EDITING, OTHER])
  })

  it('makes the one it raised active', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)
    tabs.open(OTHER)

    tabs.open({ ...EDITING })

    expect(tabs.active()).toStrictEqual(EDITING)
  })

  it('holds one document twice when the views differ', () => {
    const tabs = createOpenTabs()

    tabs.open(EDITING)
    tabs.open(PREVIEWING)

    expect(tabs.all()).toStrictEqual([EDITING, PREVIEWING])
  })

  it('has nothing active while the workspace shows something that is not a tab', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)

    tabs.leave()

    expect(tabs.active()).toBeNull()
  })

  it('keeps what is open while the workspace shows something else', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)

    tabs.leave()

    expect(tabs.all()).toStrictEqual([EDITING])
  })
})
