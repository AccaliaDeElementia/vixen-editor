'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createTabNavigation } from '../../../src/client/editor/tab-navigation.ts'
import { createPane, type Pane } from '../../../src/client/layout/pane.ts'
import type { TabAt } from '../../../src/client/layout/open-tabs.ts'

import { renderPane } from '../templates.ts'

const FIRST = { path: 'one.md', view: 'editor' } as const
const SECOND = { path: 'two.md', view: 'editor' } as const
const THIRD = { path: 'three.md', view: 'editor' } as const

let activated: TabAt[] = []

function paneHolding(...tabs: TabAt[]): Pane {
  const container = document.createElement('div')
  container.innerHTML = renderPane()
  document.body.append(container)

  const element = container.querySelector<HTMLElement>('.pane')
  if (element === null) throw new Error('the pane did not render')

  const pane = createPane(element, 'primary', {
    onActivate: () => undefined,
    onCloseRequested: () => undefined,
    onTabArrived: () => undefined,
  })
  for (const tab of tabs) pane.keep(tab)

  return pane
}

function navigating(pane: Pane): ReturnType<typeof createTabNavigation> {
  return createTabNavigation(
    () => pane,
    (_host, at) => {
      activated.push(at)
    },
  )
}

function order(pane: Pane): string[] {
  return pane.held().map((tab) => tab.path)
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  activated = []
})

describe('cycling through the tabs of a pane', () => {
  it('goes to the one after the tab in front', () => {
    const pane = paneHolding(FIRST, SECOND, THIRD)
    pane.open(FIRST)

    navigating(pane).cycle(1)

    expect(activated.map((tab) => tab.path)).toStrictEqual(['two.md'])
  })

  it('wraps round to the first from the last', () => {
    const pane = paneHolding(FIRST, SECOND, THIRD)
    pane.open(THIRD)

    navigating(pane).cycle(1)

    expect(activated.map((tab) => tab.path)).toStrictEqual(['one.md'])
  })

  it('wraps round to the last going backwards from the first', () => {
    const pane = paneHolding(FIRST, SECOND, THIRD)
    pane.open(FIRST)

    navigating(pane).cycle(-1)

    expect(activated.map((tab) => tab.path)).toStrictEqual(['three.md'])
  })

  it('takes the first when the pane shows nothing yet', () => {
    const pane = paneHolding(FIRST, SECOND)
    pane.leave()

    navigating(pane).cycle(1)

    expect(activated.map((tab) => tab.path)).toStrictEqual(['one.md'])
  })

  it('does nothing in a pane with no tabs', () => {
    navigating(paneHolding()).cycle(1)

    expect(activated).toStrictEqual([])
  })
})

describe('jumping to a tab by its position', () => {
  it('takes the one the digit names', () => {
    const pane = paneHolding(FIRST, SECOND, THIRD)

    navigating(pane).jumpTo(2)

    expect(activated.map((tab) => tab.path)).toStrictEqual(['two.md'])
  })

  it('does nothing when the strip is shorter than that', () => {
    navigating(paneHolding(FIRST)).jumpTo(4)

    expect(activated).toStrictEqual([])
  })
})

describe('moving the tab in front along its strip', () => {
  it('puts it one place later', () => {
    const pane = paneHolding(FIRST, SECOND, THIRD)
    pane.open(FIRST)

    navigating(pane).move(1)

    expect(order(pane)).toStrictEqual(['two.md', 'one.md', 'three.md'])
  })

  it('puts it one place earlier', () => {
    const pane = paneHolding(FIRST, SECOND, THIRD)
    pane.open(THIRD)

    navigating(pane).move(-1)

    expect(order(pane)).toStrictEqual(['one.md', 'three.md', 'two.md'])
  })

  it('leaves the first where it is rather than sliding past the front', () => {
    const pane = paneHolding(FIRST, SECOND, THIRD)
    pane.open(FIRST)

    navigating(pane).move(-1)

    expect(order(pane)).toStrictEqual(['one.md', 'two.md', 'three.md'])
  })

  it('does nothing when the pane shows no tab', () => {
    const pane = paneHolding(FIRST, SECOND)
    pane.leave()

    navigating(pane).move(1)

    expect(order(pane)).toStrictEqual(['one.md', 'two.md'])
  })
})
