'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createTabStrip, type TabStrip } from '../../../src/client/layout/tab-strip.ts'

const EDITING = { path: 'journal/a.md', view: 'editor' } as const
const PREVIEWING = { path: 'journal/a.md', view: 'markup' } as const
const OTHER = { path: 'notes.md', view: 'editor' } as const

let host: HTMLElement = document.createElement('div')
let activated: unknown[] = []
let kept: unknown[] = []
let closed: unknown[] = []

function strip(): TabStrip {
  return createTabStrip(host, {
    onActivate: (key) => {
      activated.push(key)
    },
    onClose: (key) => {
      closed.push(key)
    },
    onKeep: (key) => {
      kept.push(key)
    },
  })
}

function tabs(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('[role="tab"]')]
}

beforeEach(() => {
  document.body.innerHTML = ''
  host = document.createElement('div')
  document.body.append(host)
  activated = []
  kept = []
  closed = []
})

describe('showing what is open', () => {
  it('reads as a list of tabs to anything that cannot see it', () => {
    strip().show([{ ...EDITING }], EDITING)

    expect(host.getAttribute('role')).toBe('tablist')
  })

  it('shows one tab for each open document', () => {
    strip().show([{ ...EDITING }, { ...OTHER }], EDITING)

    expect(tabs()).toHaveLength(2)
  })

  it('names a tab by the file rather than the whole path', () => {
    strip().show([{ ...EDITING }], EDITING)

    expect(tabs().at(0)?.querySelector('.tabs__name')?.textContent).toBe('a.md')
  })

  it('takes a name over the path when one is given', () => {
    strip().show([{ ...EDITING, name: 'Preview of a.md' }], EDITING)

    expect(tabs().at(0)?.querySelector('.tabs__name')?.textContent).toBe('Preview of a.md')
  })

  it('keeps the order it was given, which is the reader’s order', () => {
    strip().show([{ ...OTHER }, { ...EDITING }], EDITING)

    expect(tabs().map((tab) => tab.dataset.path)).toStrictEqual(['notes.md', 'journal/a.md'])
  })

  it('replaces what was there, rather than stacking draws', () => {
    const shown = strip()
    shown.show([{ ...EDITING }, { ...OTHER }], EDITING)

    shown.show([{ ...EDITING }], EDITING)

    expect(tabs()).toHaveLength(1)
  })
})

describe('which tab is the active one', () => {
  it('says so on the tab itself', () => {
    strip().show([{ ...EDITING }, { ...OTHER }], OTHER)

    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toStrictEqual(['false', 'true'])
  })

  it('offers the tab key one stop, landing on the active tab', () => {
    strip().show([{ ...EDITING }, { ...OTHER }], OTHER)

    expect(tabs().map((tab) => tab.tabIndex)).toStrictEqual([-1, 0])
  })
})

describe('a tab is keyed by what it shows and how', () => {
  it('holds one document twice when the views differ', () => {
    strip().show([{ ...EDITING }, { ...PREVIEWING }], EDITING)

    expect(tabs().map((tab) => tab.dataset.view)).toStrictEqual(['editor', 'markup'])
  })

  it('tells the two apart when choosing the active one', () => {
    strip().show([{ ...EDITING }, { ...PREVIEWING }], PREVIEWING)

    expect(tabs().map((tab) => tab.getAttribute('aria-selected'))).toStrictEqual(['false', 'true'])
  })
})

describe('choosing a tab', () => {
  it('tells the caller which one, by path and view', () => {
    strip().show([{ ...EDITING }, { ...PREVIEWING }], EDITING)

    tabs().at(1)?.click()

    expect(activated).toStrictEqual([PREVIEWING])
  })

  it('tells the caller even when the tab is already active, since that is still a request', () => {
    strip().show([{ ...EDITING }], EDITING)

    tabs().at(0)?.click()

    expect(activated).toStrictEqual([EDITING])
  })
})

describe('a tab that is only being looked at', () => {
  it('is marked so a reader can see it will not last', () => {
    strip().show([{ ...EDITING, ephemeral: true }], EDITING)

    expect(tabs().at(0)?.classList.contains('tabs__tab--looking')).toBe(true)
  })

  it('says so in words, since italics alone reach nobody using a screen reader', () => {
    strip().show([{ ...EDITING, ephemeral: true }], EDITING)

    expect(tabs().at(0)?.getAttribute('aria-description')).toBe('closes when you open something else')
  })

  it('is unmarked once it is permanent', () => {
    strip().show([{ ...EDITING, ephemeral: false }], EDITING)

    expect(tabs().at(0)?.classList.contains('tabs__tab--looking')).toBe(false)
  })

  it('says nothing extra once it is permanent', () => {
    strip().show([{ ...EDITING, ephemeral: false }], EDITING)

    expect(tabs().at(0)?.hasAttribute('aria-description')).toBe(false)
  })

  it('asks to be kept when it is double-clicked', () => {
    strip().show([{ ...EDITING, ephemeral: true }], EDITING)

    tabs()
      .at(0)
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(kept).toStrictEqual([EDITING])
  })
})

describe('a tab that is still open when the strip is drawn again', () => {
  function tabFor(at: { path: string; view: string }): Element | null {
    return host.querySelector(`[data-tab="${at.view}:${at.path}"]`)
  }

  it('is the same element, so a gesture spanning two draws is not thrown away', () => {
    const showing = strip()
    showing.show([EDITING], EDITING)
    const before = tabFor(EDITING)

    showing.show([EDITING, OTHER], OTHER)

    expect(tabFor(EDITING)).toBe(before)
  })

  it('still shows which one is active after the redraw', () => {
    const showing = strip()
    showing.show([EDITING], EDITING)

    showing.show([EDITING, OTHER], OTHER)

    expect(tabFor(EDITING)?.getAttribute('aria-selected')).toBe('false')
  })

  it('stops being marked as one the reader is only looking at', () => {
    const showing = strip()
    showing.show([{ ...EDITING, ephemeral: true }], EDITING)

    showing.show([{ ...EDITING, ephemeral: false }], EDITING)

    expect(tabFor(EDITING)?.classList.contains('tabs__tab--looking')).toBe(false)
  })

  it('takes the place the reader put it in when the order changes', () => {
    const showing = strip()
    showing.show([EDITING, OTHER], OTHER)

    showing.show([OTHER, EDITING], OTHER)

    expect(tabs().map((tab) => tab.dataset.path)).toStrictEqual(['notes.md', 'journal/a.md'])
  })

  it('is gone once it is no longer open', () => {
    const showing = strip()
    showing.show([EDITING, OTHER], OTHER)

    showing.show([OTHER], OTHER)

    expect(tabFor(EDITING)).toBeNull()
  })

  it('does not stack a second listener when it is drawn twice', () => {
    const showing = strip()
    showing.show([EDITING], EDITING)
    showing.show([EDITING], EDITING)

    tabFor(EDITING)?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(kept).toStrictEqual([EDITING])
  })
})

describe('the control that closes a tab', () => {
  function closer(): HTMLElement | null {
    return host.querySelector<HTMLElement>('.tabs__close')
  }

  it('is offered on every tab', () => {
    strip().show([EDITING], EDITING)

    expect(closer()).not.toBeNull()
  })

  it('says which tab it belongs to, so a reader of the markup can tell', () => {
    strip().show([EDITING], EDITING)

    expect(closer()?.dataset.closes).toBe('journal/a.md')
  })

  it('asks for the tab to be closed', () => {
    strip().show([EDITING], EDITING)

    closer()?.click()

    expect(closed).toStrictEqual([EDITING])
  })

  it('does not also activate the tab it is closing', () => {
    strip().show([EDITING], EDITING)

    closer()?.click()

    expect(activated).toStrictEqual([])
  })

  it('is hidden from assistive technology, because a control inside a tab is a nested control', () => {
    strip().show([EDITING], EDITING)

    expect(closer()?.getAttribute('aria-hidden')).toBe('true')
  })
})
