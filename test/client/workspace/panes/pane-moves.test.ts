'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createPaneMoves } from '../../../../src/client/workspace/panes/pane-moves.ts'
import type { PaneWorkspace } from '../../../../src/client/workspace/panes/pane-workspace.ts'
import type { TabAt } from '../../../../src/client/workspace/tabs/open-tabs.ts'
import { cast } from '../../../cast.ts'

let root: HTMLElement = document.createElement('div')
let received: TabAt[] = []
let shown: string[] = []
let carriedFrom: Array<PaneWorkspace | null> = []
let visited: PaneWorkspace[] = []
let carried: TabAt[] = []
let forgotten = 0

function paneHolding(held: readonly TabAt[], showing: TabAt | null): PaneWorkspace {
  return cast<PaneWorkspace>({
    element: document.createElement('section'),
    pane: cast({
      held: () => held,
      showing: () => showing,
      receive: (at: TabAt) => {
        received.push(at)
      },
      close: () => undefined,
    }),
  })
}

function movesBetween(primary: PaneWorkspace, aside: PaneWorkspace): ReturnType<typeof createPaneMoves> {
  return createPaneMoves({
    root,
    primary,
    summon: () => null,
    inFront: () => aside,
    goTo: () => undefined,
    onCarried: () => undefined,
    forgetAside: () => undefined,
    aside: () => aside,
    settleOn: (at: TabAt, carryingFrom: PaneWorkspace | null) => {
      shown.push(at.path)
      carriedFrom.push(carryingFrom)
    },
  })
}

type MovesOptions = Parameters<typeof createPaneMoves>[0]

function movesWith(overrides: Partial<MovesOptions>): ReturnType<typeof createPaneMoves> {
  return createPaneMoves({
    root,
    primary: paneHolding([], null),
    summon: () => null,
    inFront: () => paneHolding([], null),
    goTo: (surface: PaneWorkspace) => {
      visited.push(surface)
    },
    onCarried: (at: TabAt) => {
      carried.push(at)
    },
    forgetAside: () => {
      forgotten += 1
    },
    aside: () => null,
    settleOn: () => undefined,
    ...overrides,
  })
}

function panesMarkup(): void {
  root.innerHTML =
    '<div data-part="panes"><section data-part="pane"></section><section data-part="pane"></section></div>'
}

function frontFlags(): Array<string | undefined> {
  return [...root.querySelectorAll<HTMLElement>('[data-part="pane"]')].map((pane) => pane.dataset.infront)
}

beforeEach(() => {
  localStorage.clear()
  received = []
  shown = []
  carriedFrom = []
  visited = []
  carried = []
  forgotten = 0
  document.body.innerHTML = ''
  root = document.createElement('div')
  document.body.append(root)
})

describe('collapsing the aside onto the primary', () => {
  it('brings every tab it held across, so none of them is lost with the pane', () => {
    const aside = paneHolding(
      [
        { path: 'a.md', view: 'editor' },
        { path: 'b.md', view: 'markup' },
      ],
      null,
    )

    movesBetween(paneHolding([], null), aside).collapseOntoPrimary(aside)

    expect(received).toStrictEqual([
      { path: 'a.md', view: 'editor' },
      { path: 'b.md', view: 'markup' },
    ])
  })

  it('opens the one it was showing, so the reader keeps looking at what they were', () => {
    const showing: TabAt = { path: 'b.md', view: 'editor' }
    const aside = paneHolding([{ path: 'a.md', view: 'editor' }, showing], showing)

    movesBetween(paneHolding([], null), aside).collapseOntoPrimary(aside)

    expect(shown).toStrictEqual(['b.md'])
  })

  it('opens nothing when the pane held tabs but was showing none of them', () => {
    const aside = paneHolding([{ path: 'a.md', view: 'editor' }], null)

    movesBetween(paneHolding([], null), aside).collapseOntoPrimary(aside)

    expect(shown).toStrictEqual([])
  })
})

describe('which pane is marked as the one in front', () => {
  it('marks the pane in front, so the styling can follow focus', () => {
    panesMarkup()
    const [first] = [...root.querySelectorAll<HTMLElement>('[data-part="pane"]')]
    const front = cast<PaneWorkspace>({ element: first, pane: cast({ showing: () => null }) })

    movesWith({ inFront: () => front, primary: front }).toPane('beside', false, false)

    expect(frontFlags()).toStrictEqual(['true', 'false'])
  })
})

describe('where a collapsed tab is settled from', () => {
  it('names the pane it came from when that pane still held it', () => {
    const at: TabAt = { path: 'a.md', view: 'editor' }
    const aside = paneHolding([at], at)

    movesBetween(paneHolding([], null), aside).collapseOntoPrimary(aside)

    expect(carriedFrom).toStrictEqual([aside])
  })

  it('names no pane when the one in front was showing something that pane never held', () => {
    const elsewhere: TabAt = { path: 'elsewhere.md', view: 'editor' }
    const aside = paneHolding([{ path: 'a.md', view: 'editor' }], elsewhere)

    movesBetween(paneHolding([], null), aside).collapseOntoPrimary(aside)

    expect(carriedFrom).toStrictEqual([null])
  })
})

describe('closing the aside', () => {
  it('simply dismisses it when there is no aside to collapse', () => {
    movesWith({ aside: () => null }).closeTheAside()

    expect({ forgotten, received }).toStrictEqual({ forgotten: 1, received: [] })
  })

  it('simply dismisses it when the aside holds nothing worth carrying', () => {
    const empty = cast<PaneWorkspace>({
      element: document.createElement('section'),
      pane: cast({ isEmpty: () => true, held: () => [], showing: () => null }),
    })

    movesWith({ aside: () => empty }).closeTheAside()

    expect(received).toStrictEqual([])
  })

  it('collapses an aside that still holds something, so its tabs are not thrown away', () => {
    const at: TabAt = { path: 'a.md', view: 'editor' }
    const holding = cast<PaneWorkspace>({
      element: document.createElement('section'),
      pane: cast({ isEmpty: () => false, held: () => [at], showing: () => null }),
    })
    const primary = paneHolding([], null)

    movesWith({ aside: () => holding, primary, inFront: () => primary }).closeTheAside()

    expect(received).toStrictEqual([at])
  })
})

describe('moving to another pane', () => {
  it('goes nowhere when no pane can be summoned to arrive at', () => {
    movesWith({ summon: () => null }).toPane('beside', true, false)

    expect(visited).toStrictEqual([])
  })

  it('carries the showing tab when asked to carry', () => {
    const at: TabAt = { path: 'a.md', view: 'editor' }
    const leaving = paneHolding([at], at)
    const arriving = paneHolding([], null)

    movesWith({ summon: () => arriving, inFront: () => leaving }).toPane('beside', true, true)

    expect(carried).toStrictEqual([at])
  })

  it('carries nothing when the pane it leaves is showing nothing', () => {
    const arriving = paneHolding([], null)

    movesWith({ summon: () => arriving, inFront: () => paneHolding([], null) }).toPane('beside', true, true)

    expect(carried).toStrictEqual([])
  })

  it('carries nothing when the move was not asked to carry', () => {
    const at: TabAt = { path: 'a.md', view: 'editor' }
    const arriving = paneHolding([], null)

    movesWith({ summon: () => arriving, inFront: () => paneHolding([at], at) }).toPane('beside', true, false)

    expect(carried).toStrictEqual([])
  })
})
