'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createPane, type Pane } from '../../../src/client/layout/pane.ts'
import { readKeptTabs, writeKeptTabs, type PaneId } from '../../../src/client/layout/kept-tabs.ts'
import type { TabAt } from '../../../src/client/layout/open-tabs.ts'

import { renderPane } from '../templates.ts'

const EDITING = { path: 'notes.md', view: 'editor' } as const
const PREVIEWING = { path: 'notes.md', view: 'markup' } as const
const OTHER = { path: 'other.md', view: 'editor' } as const

let activated: TabAt[] = []
let closeRequests: TabAt[] = []

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

    expect(readKeptTabs('primary')).toStrictEqual([{ ...EDITING }])
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
      createPane(bare, 'primary', { onActivate: () => undefined, onCloseRequested: () => undefined }).open(EDITING)
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

    expect(readKeptTabs('primary')).toStrictEqual([{ ...EDITING }])
  })

  it('restores a pane only what that pane kept', () => {
    writeKeptTabs('secondary', [OTHER])
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
