'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createPaneMoves } from '../../../src/client/editor/pane-moves.ts'
import type { PaneWorkspace } from '../../../src/client/editor/pane-workspace.ts'
import type { TabAt } from '../../../src/client/layout/open-tabs.ts'
import { cast } from '../../cast.ts'

let root: HTMLElement = document.createElement('div')
let received: TabAt[] = []
let shown: string[] = []

function paneHolding(held: readonly TabAt[], showing: TabAt | null): PaneWorkspace {
  return cast<PaneWorkspace>({
    element: document.createElement('section'),
    pane: cast({
      held: () => held,
      showing: () => showing,
      receive: (at: TabAt) => {
        received.push(at)
      },
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
    settleOn: (at: TabAt, _carryingFrom: PaneWorkspace | null) => {
      shown.push(at.path)
    },
  })
}

beforeEach(() => {
  localStorage.clear()
  received = []
  shown = []
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
