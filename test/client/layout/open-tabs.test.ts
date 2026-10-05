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

    expect(tabs.all()).toStrictEqual([{ ...EDITING, ephemeral: true }])
  })

  it('makes what was opened the active one', () => {
    const tabs = createOpenTabs()

    tabs.open(EDITING)

    expect(tabs.active()).toStrictEqual(EDITING)
  })

  it('keeps the order things were opened in, which is the reader’s order', () => {
    const tabs = createOpenTabs()

    tabs.keep(EDITING)
    tabs.keep(OTHER)

    expect(tabs.all().map((tab) => tab.path)).toStrictEqual(['journal/a.md', 'notes.md'])
  })

  it('raises a tab it already holds rather than opening a second', () => {
    const tabs = createOpenTabs()
    tabs.keep(EDITING)
    tabs.keep(OTHER)

    tabs.open({ ...EDITING })

    expect(tabs.all().map((tab) => tab.path)).toStrictEqual(['journal/a.md', 'notes.md'])
  })

  it('makes the one it raised active', () => {
    const tabs = createOpenTabs()
    tabs.keep(EDITING)
    tabs.keep(OTHER)

    tabs.open({ ...EDITING })

    expect(tabs.active()).toStrictEqual(EDITING)
  })

  it('holds one document twice when the views differ', () => {
    const tabs = createOpenTabs()

    tabs.keep(EDITING)
    tabs.keep(PREVIEWING)

    expect(tabs.all().map((tab) => tab.view)).toStrictEqual(['editor', 'markup'])
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

    expect(tabs.all()).toStrictEqual([{ ...EDITING, ephemeral: true }])
  })
})

describe('a tab opened just to look at something', () => {
  it('arrives ephemeral', () => {
    const tabs = createOpenTabs()

    tabs.open(EDITING)

    expect(tabs.all()).toStrictEqual([{ ...EDITING, ephemeral: true }])
  })

  it('is displaced by the next one, so looking around does not pile up tabs', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)

    tabs.open(OTHER)

    expect(tabs.all()).toStrictEqual([{ ...OTHER, ephemeral: true }])
  })

  it('is displaced in its own place, rather than jumping to the end', () => {
    const tabs = createOpenTabs()
    tabs.keep(EDITING)
    tabs.open(OTHER)
    tabs.keep(PREVIEWING)

    tabs.open({ path: 'third.md', view: 'editor' })

    expect(tabs.all().map((tab) => tab.path)).toStrictEqual(['journal/a.md', 'third.md', 'journal/a.md'])
  })

  it('displaces nothing when the tab in the way is permanent', () => {
    const tabs = createOpenTabs()
    tabs.keep(EDITING)

    tabs.open(OTHER)

    expect(tabs.all().map((tab) => tab.path)).toStrictEqual(['journal/a.md', 'notes.md'])
  })

  it('stays ephemeral when it is opened again, since looking twice is still looking', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)

    tabs.open({ ...EDITING })

    expect(tabs.all()).toStrictEqual([{ ...EDITING, ephemeral: true }])
  })
})

describe('a tab the reader means to keep', () => {
  it('arrives permanent when it was opened to be kept', () => {
    const tabs = createOpenTabs()

    tabs.keep(EDITING)

    expect(tabs.all()).toStrictEqual([{ ...EDITING, ephemeral: false }])
  })

  it('is promoted in place when it was already open to look at', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)

    tabs.keep({ ...EDITING })

    expect(tabs.all()).toStrictEqual([{ ...EDITING, ephemeral: false }])
  })

  it('is promoted by asking directly, which is what an edit does', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)

    tabs.promote({ ...EDITING })

    expect(tabs.all()).toStrictEqual([{ ...EDITING, ephemeral: false }])
  })

  it('survives the next thing opened to look at', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)
    tabs.promote(EDITING)

    tabs.open(OTHER)

    expect(tabs.all().map((tab) => tab.path)).toStrictEqual(['journal/a.md', 'notes.md'])
  })

  it('ignores a promotion for a tab it does not hold', () => {
    const tabs = createOpenTabs()
    tabs.open(EDITING)

    tabs.promote(OTHER)

    expect(tabs.all()).toStrictEqual([{ ...EDITING, ephemeral: true }])
  })
})
