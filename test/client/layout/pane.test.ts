'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { cast } from '../../cast.ts'
import { createPane, type Pane } from '../../../src/client/layout/pane.ts'
import { readKeptTabs, writeKeptTabs, type PaneId } from '../../../src/client/layout/kept-tabs.ts'
import type { TabAt } from '../../../src/client/layout/open-tabs.ts'

import { renderPane } from '../templates.ts'

const EDITING = { path: 'notes.md', view: 'editor' } as const
const PREVIEWING = { path: 'notes.md', view: 'markup' } as const
const OTHER = { path: 'other.md', view: 'editor' } as const

let activated: TabAt[] = []
let closeRequests: TabAt[] = []
let arrivals: Array<{ identity: string; toIndex: number }> = []
let displaced: TabAt[] = []

function paneElement(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderPane()
  document.body.append(container)

  const element = container.querySelector<HTMLElement>('.pane')
  if (element === null) throw new Error('the pane did not render')

  return element
}

function pane(id: PaneId = 'primary', element = paneElement()): Pane {
  return createPane(element, id, {
    onActivate: (at) => {
      activated.push(at)
    },
    onCloseRequested: (at) => {
      closeRequests.push(at)
    },
    onTabArrived: (identity, toIndex) => {
      arrivals.push({ identity, toIndex })
    },
    onDisplaced: (at) => {
      displaced.push(at)
    },
  })
}

function tabsIn(element: HTMLElement): Array<string | undefined> {
  return [...element.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => tab.dataset.tab)
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  activated = []
  closeRequests = []
  arrivals = []
  displaced = []
})

describe('a pane holding its own tabs', () => {
  it('shows a tab for what it opened', () => {
    const element = paneElement()

    pane('primary', element).open(EDITING)

    expect(tabsIn(element)).toStrictEqual(['editor:notes.md'])
  })

  it('tells them apart by view type, so a preview sits beside its editor', () => {
    const element = paneElement()
    const held = pane('primary', element)
    held.open(EDITING)

    held.keep(PREVIEWING)

    expect(tabsIn(element)).toStrictEqual(['editor:notes.md', 'markup:notes.md'])
  })

  it('reports an activated tab with the view type it carries', () => {
    const element = paneElement()
    pane('primary', element).keep(PREVIEWING)

    element.querySelector<HTMLElement>('[data-tab="markup:notes.md"]')?.click()

    expect(activated).toStrictEqual([PREVIEWING])
  })

  it('keeps a tab that was double-clicked', () => {
    const element = paneElement()
    pane('primary', element).open(EDITING)

    element
      .querySelector<HTMLElement>('[data-tab="editor:notes.md"]')
      ?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))

    expect(readKeptTabs('primary').tabs).toStrictEqual([{ ...EDITING }])
  })

  it('follows a move, so a rename does not orphan its tabs', () => {
    const element = paneElement()
    const held = pane('primary', element)
    held.keep(EDITING)

    held.followMove({ from: 'notes.md', to: 'archive/notes.md' })

    expect(tabsIn(element)).toStrictEqual(['editor:archive/notes.md'])
  })

  it('declines quietly when its markup carries no strip', () => {
    const bare = document.createElement('div')

    expect(() => {
      createPane(bare, 'primary', {
        onActivate: () => undefined,
        onCloseRequested: () => undefined,
        onTabArrived: () => undefined,
        onDisplaced: () => undefined,
      }).open(EDITING)
    }).not.toThrow()
  })
})

describe('two panes side by side', () => {
  it('keeps each pane the tabs it was given', () => {
    const first = paneElement()
    const second = paneElement()
    pane('primary', first).keep(EDITING)

    pane('secondary', second).keep(OTHER)

    expect(tabsIn(first)).toStrictEqual(['editor:notes.md'])
  })

  it('shows the second pane only its own', () => {
    const first = paneElement()
    const second = paneElement()
    pane('primary', first).keep(EDITING)

    pane('secondary', second).keep(OTHER)

    expect(tabsIn(second)).toStrictEqual(['editor:other.md'])
  })

  it('remembers them apart, so a reload does not merge the panes', () => {
    pane('primary', paneElement()).keep(EDITING)

    pane('secondary', paneElement()).keep(OTHER)

    expect(readKeptTabs('primary').tabs).toStrictEqual([{ ...EDITING }])
  })

  it('restores a pane only what that pane kept', () => {
    writeKeptTabs('secondary', [OTHER], null)
    const element = paneElement()

    pane('secondary', element)

    expect(tabsIn(element)).toStrictEqual(['editor:other.md'])
  })
})

describe('whether a pane holds a tab permanently', () => {
  it('says so for one that was kept', () => {
    const held = pane('primary')
    held.keep(EDITING)

    expect(held.holdsPermanently(EDITING)).toBe(true)
  })

  it('says not for one it is only looking at', () => {
    const held = pane('primary')
    held.open(EDITING)

    expect(held.holdsPermanently(EDITING)).toBe(false)
  })

  it('says not for one it does not hold at all', () => {
    expect(pane('primary').holdsPermanently(OTHER)).toBe(false)
  })
})

describe('a tab dropped on a strip', () => {
  function dropOn(element: HTMLElement, identity: string, onto: string | null): void {
    const held = new Map<string, string>([['application/x-vixen-tab', identity]])
    const data = cast<DataTransfer>({ getData: (type: string) => held.get(type) ?? '', types: [...held.keys()] })
    const target =
      onto === null ? element.querySelector('[data-part="tabs"]') : element.querySelector(`[data-tab="${onto}"]`)

    target?.dispatchEvent(cast<DragEvent>(Object.assign(new Event('drop', { bubbles: true }), { dataTransfer: data })))
  }

  it('is put where it was dropped when the strip already holds it', () => {
    const element = paneElement()
    const held = pane('primary', element)
    held.keep(EDITING)
    held.keep(OTHER)

    dropOn(element, 'editor:other.md', 'editor:notes.md')

    expect(tabsIn(element)).toStrictEqual(['editor:other.md', 'editor:notes.md'])
  })

  it('is remembered in its new place, so a reload agrees', () => {
    const element = paneElement()
    const held = pane('primary', element)
    held.keep(EDITING)
    held.keep(OTHER)

    dropOn(element, 'editor:other.md', 'editor:notes.md')

    expect(readKeptTabs('primary').tabs.map((tab) => tab.path)).toStrictEqual(['other.md', 'notes.md'])
  })

  it('is announced as arriving when the strip does not hold it', () => {
    const element = paneElement()
    pane('secondary', element).keep(EDITING)

    dropOn(element, 'markup:elsewhere.md', 'editor:notes.md')

    expect(arrivals).toStrictEqual([{ identity: 'markup:elsewhere.md', toIndex: 0 }])
  })
})

describe('a pane receiving a tab from the other one', () => {
  it('holds it', () => {
    const element = paneElement()
    const held = pane('secondary', element)

    held.receive(PREVIEWING, 0)

    expect(tabsIn(element)).toStrictEqual(['markup:notes.md'])
  })

  it('puts it where it was dropped rather than at the end', () => {
    const element = paneElement()
    const held = pane('secondary', element)
    held.keep(EDITING)

    held.receive(PREVIEWING, 0)

    expect(tabsIn(element)).toStrictEqual(['markup:notes.md', 'editor:notes.md'])
  })

  it('keeps it, because a tab carried across was not an idle glance', () => {
    const element = paneElement()
    const held = pane('secondary', element)

    held.receive(PREVIEWING, 0)

    expect(readKeptTabs('secondary').tabs).toStrictEqual([{ ...PREVIEWING }])
  })
})

describe('a tab that goes to make room for another', () => {
  it('is reported, so the reader can be told what closed', () => {
    const held = pane()
    held.open(EDITING)

    held.open(OTHER)

    expect(displaced).toStrictEqual([EDITING])
  })

  it('is not reported when the tab in the way was one the reader kept', () => {
    const held = pane()
    held.keep(EDITING)

    held.open(OTHER)

    expect(displaced).toStrictEqual([])
  })
})
