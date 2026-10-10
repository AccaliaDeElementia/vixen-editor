'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createClosingTabs, type ClosingSurface } from '../../../../src/client/workspace/tabs/closing-tabs.ts'
import { tabIdentity, type TabAt } from '../../../../src/client/workspace/tabs/open-tabs.ts'
import type { Pane } from '../../../../src/client/workspace/panes/pane.ts'

import { cast } from '../../../cast.ts'
import { given } from '../../../conditions.ts'

const EDITOR: TabAt = { path: 'notes.md', view: 'editor' }
const MARKUP: TabAt = { path: 'notes.md', view: 'markup' }
const SOURCE: TabAt = { path: 'notes.md', view: 'source' }
const ANOTHER: TabAt = { path: 'other.md', view: 'editor' }
const TRASHED: TabAt = { path: 'gone.md', view: 'deleted' }
const ONE_ASKING = 1

interface Held {
  tabs?: readonly TabAt[]
  saveState?: string
  mayLeave?: boolean
}

interface Fake {
  surface: ClosingSurface
  closed: TabAt[]
  revealed: string[]
}

let fakes: Fake[] = []
let emptiedTheWorkspace = 0
let asked = 0

function surfaceHolding({ tabs = [], saveState = 'clean', mayLeave = true }: Held = {}): Fake {
  let open = [...tabs]
  const closed: TabAt[] = []
  const revealed: string[] = []

  const surface = cast<ClosingSurface>({
    pane: cast<Pane>({
      close: (at: TabAt) => {
        if (!open.some((candidate) => tabIdentity(candidate) === tabIdentity(at))) return

        closed.push(at)
        open = open.filter((candidate) => tabIdentity(candidate) !== tabIdentity(at))
      },
      held: () => open,
      showing: () => open.at(0) ?? null,
      isEmpty: () => open.length === 0,
    }),
    saveState: () => saveState,
    settleBeforeLeaving: async () => {
      asked += 1

      return await Promise.resolve(mayLeave)
    },
    showNothing: () => {
      revealed.push('nothing')
    },
    showActive: () => {
      revealed.push('active')
    },
  })

  const fake = { surface, closed, revealed }
  fakes.push(fake)

  return fake
}

function closingAcross(...surfaces: readonly ClosingSurface[]): ReturnType<typeof createClosingTabs> {
  return createClosingTabs({
    inFront: () => surfaces[0] ?? surfaceHolding().surface,
    everySurface: () => surfaces,
    showNothingAtAll: () => {
      emptiedTheWorkspace += 1
    },
  })
}

beforeEach(() => {
  fakes = []
  emptiedTheWorkspace = 0
  asked = 0
})

describe('closing a preview tab', () => {
  it('closes it at once, since a preview holds nothing unsaved', () => {
    const only = surfaceHolding({ tabs: [MARKUP] })

    closingAcross(only.surface).requestClose(only.surface, MARKUP)

    expect(only.closed).toStrictEqual([MARKUP])
  })

  it('never asks the reader about it', () => {
    const only = surfaceHolding({ tabs: [MARKUP], saveState: 'dirty' })

    closingAcross(only.surface).requestClose(only.surface, MARKUP)

    expect(asked).toBe(0)
  })

  it('settles the pane it left behind', () => {
    const only = surfaceHolding({ tabs: [MARKUP, ANOTHER] })

    closingAcross(only.surface).requestClose(only.surface, MARKUP)

    expect(only.revealed).toStrictEqual(['active'])
  })
})

describe('closing a saved document', () => {
  it('closes the tab itself', () => {
    const only = surfaceHolding({ tabs: [EDITOR] })

    closingAcross(only.surface).requestClose(only.surface, EDITOR)

    expect(only.closed).toStrictEqual([EDITOR])
  })

  it('takes its previews with it, so no preview outlives the document it was of', () => {
    const only = surfaceHolding({ tabs: [EDITOR, SOURCE, MARKUP] })

    closingAcross(only.surface).requestClose(only.surface, EDITOR)

    expect(only.closed).toStrictEqual([EDITOR, SOURCE, MARKUP])
  })

  it('takes a preview open in the other pane too, which is where one usually sits', () => {
    const first = surfaceHolding({ tabs: [EDITOR] })
    const second = surfaceHolding({ tabs: [MARKUP] })

    closingAcross(first.surface, second.surface).requestClose(first.surface, EDITOR)

    expect(second.closed).toStrictEqual([MARKUP])
  })

  it('leaves another document alone', () => {
    const only = surfaceHolding({ tabs: [EDITOR, ANOTHER] })

    closingAcross(only.surface).requestClose(only.surface, EDITOR)

    expect(only.closed).toStrictEqual([EDITOR])
  })

  it('settles every pane, because a preview may have closed in any of them', () => {
    const first = surfaceHolding({ tabs: [EDITOR] })
    const second = surfaceHolding({ tabs: [ANOTHER] })

    closingAcross(first.surface, second.surface).requestClose(first.surface, EDITOR)

    expect(second.revealed).toStrictEqual(['active'])
  })
})

describe('closing a document with unsaved changes', () => {
  it('asks the reader before anything closes', () => {
    const only = surfaceHolding({ tabs: [EDITOR], saveState: 'dirty' })

    closingAcross(only.surface).requestClose(only.surface, EDITOR)

    expect(asked).toBe(ONE_ASKING)
  })

  it('closes it once the reader has let it go', async () => {
    const only = surfaceHolding({ tabs: [EDITOR], saveState: 'dirty', mayLeave: true })
    const closing = closingAcross(only.surface)
    closing.requestClose(only.surface, EDITOR)

    await closing.settled()

    expect(only.closed).toStrictEqual([EDITOR])
  })

  it('leaves it open when the reader decides to stay', async () => {
    const only = surfaceHolding({ tabs: [EDITOR], saveState: 'dirty', mayLeave: false })
    const closing = closingAcross(only.surface)
    closing.requestClose(only.surface, EDITOR)

    await closing.settled()

    expect(only.closed).toStrictEqual([])
  })

  it('nothing is closed while the reader is still being asked', () => {
    const only = surfaceHolding({ tabs: [EDITOR], saveState: 'dirty' })

    closingAcross(only.surface).requestClose(only.surface, EDITOR)

    expect(only.closed).toStrictEqual([])
  })
})

describe('what a pane shows once a tab has gone', () => {
  it('shows whatever it still holds', () => {
    const only = surfaceHolding({ tabs: [ANOTHER] })

    closingAcross(only.surface).settle(only.surface)

    expect(only.revealed).toStrictEqual(['active'])
  })

  it('shows nothing when it holds nothing', () => {
    const only = surfaceHolding()

    closingAcross(only.surface).settle(only.surface)

    expect(only.revealed).toStrictEqual(['nothing'])
  })

  it('says the whole workspace is empty only when every pane is', () => {
    const only = surfaceHolding()

    closingAcross(only.surface).settle(only.surface)

    expect(emptiedTheWorkspace).toBe(ONE_ASKING)
  })

  it('says nothing of the sort while another pane still holds a tab', () => {
    const empty = surfaceHolding()
    const busy = surfaceHolding({ tabs: [ANOTHER] })

    closingAcross(empty.surface, busy.surface).settle(empty.surface)

    expect(emptiedTheWorkspace).toBe(0)
  })
})

describe('the trash being emptied underneath the tabs', () => {
  it('closes a tab showing an entry that is gone for good', () => {
    const only = surfaceHolding({ tabs: [TRASHED, ANOTHER] })

    closingAcross(only.surface).closeTrashTabs()

    expect(only.closed).toStrictEqual([TRASHED])
  })

  it('settles the pane it took a tab from', () => {
    const only = surfaceHolding({ tabs: [TRASHED, ANOTHER] })

    closingAcross(only.surface).closeTrashTabs()

    expect(only.revealed).toStrictEqual(['active'])
  })

  it('leaves a pane that held no such tab entirely alone', () => {
    const only = surfaceHolding({ tabs: [ANOTHER] })

    closingAcross(only.surface).closeTrashTabs()

    expect(only.revealed).toStrictEqual([])
  })
})

describe('closing whatever is in front', () => {
  it('closes the tab the front pane is showing', () => {
    const front = surfaceHolding({ tabs: [ANOTHER] })

    closingAcross(front.surface).closeTheTabInFront()

    expect(front.closed).toStrictEqual([ANOTHER])
  })

  it('closes nothing when the front pane is showing nothing', () => {
    const front = surfaceHolding()
    given(() => {
      expect(front.surface.pane.showing()).toBeNull()
    })

    closingAcross(front.surface).closeTheTabInFront()

    expect(front.closed).toStrictEqual([])
  })
})
