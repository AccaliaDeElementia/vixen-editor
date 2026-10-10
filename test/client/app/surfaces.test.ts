'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createSurfaces } from '../../../src/client/app/surfaces.ts'
import { tabIdentity, type TabAt } from '../../../src/client/workspace/tabs/open-tabs.ts'
import type { PaneWorkspace } from '../../../src/client/workspace/panes/pane-workspace.ts'
import type { DocumentTab } from '../../../src/client/document/document-tab.ts'
import type { Pane } from '../../../src/client/workspace/panes/pane.ts'

import { STORE_ROOT } from '../../../src/shared/store-path.ts'

import { cast } from '../../cast.ts'

const EDITOR: TabAt = { path: 'notes.md', view: 'editor' }
const PREVIEW: TabAt = { path: 'notes.md', view: 'markup' }
const ELSEWHERE: TabAt = { path: 'other.md', view: 'editor' }
type Carried = NonNullable<ReturnType<PaneWorkspace['handOver']>>

const AT_THE_END = 0
const ONE = 1

interface Built {
  tabs?: readonly TabAt[]
  saveState?: string
  carries?: Carried | null
}

interface Fake {
  surface: PaneWorkspace
  name: string
}

let steps: string[] = []
let tracked: Array<Promise<void>> = []
let collapsed: string[] = []
let dismissals = 0
let emptiedTheWorkspace = 0

function describeRoot(at: string): string {
  return at === STORE_ROOT ? 'the root' : at
}

function fake(name: string, { tabs = [], saveState = 'clean', carries = null }: Built = {}): Fake {
  let open = [...tabs]

  const surface = cast<PaneWorkspace>({
    pane: cast<Pane>({
      close: (at: TabAt) => {
        steps.push(`${name} closed ${tabIdentity(at)}`)
        open = open.filter((candidate) => tabIdentity(candidate) !== tabIdentity(at))
      },
      receive: (at: TabAt, toIndex: number) => {
        steps.push(`${name} received ${tabIdentity(at)} at ${String(toIndex)}`)
        open = [...open, at]
      },
      held: () => open,
      showing: () => open.at(0) ?? null,
      isEmpty: () => open.length === 0,
    }),
    editor: () =>
      cast<DocumentTab>({
        saveState: () => saveState,
        settleBeforeLeaving: async () => await Promise.resolve(true),
      }),
    workspace: { show: (view: string, at: string) => steps.push(`${name} showed ${view} at ${describeRoot(at)}`) },
    release: () => steps.push(`${name} released`),
    showTab: async (at: TabAt) => {
      await Promise.resolve()
      steps.push(`${name} showed ${tabIdentity(at)}`)
    },
    flush: async () => {
      await Promise.resolve()
      steps.push(`${name} flushed`)

      return true
    },
    handOver: () => {
      steps.push(`${name} handed over`)

      return carries
    },
    adopt: (entryPath: string) => steps.push(`${name} adopted ${entryPath}`),
    showDocument: async (entryPath: string) => {
      await Promise.resolve()
      steps.push(`${name} opened ${entryPath}`)
    },
  })

  return { surface, name }
}

function surfacesOf(primary: Fake, aside: Fake | null): ReturnType<typeof createSurfaces> {
  return createSurfaces({
    primarySurface: primary.surface,
    elsewhere: () => aside?.surface ?? null,
    open: () => (aside === null ? [primary.surface] : [primary.surface, aside.surface]),
    inFront: () => primary.surface,
    track: (work: Promise<void>) => {
      tracked.push(work)
    },
    collapseOntoPrimary: (surface: PaneWorkspace) => {
      collapsed.push(surface === aside?.surface ? 'aside' : 'something else')
    },
    dismissAside: () => {
      dismissals += ONE
    },
    showNothingAtAll: () => {
      emptiedTheWorkspace += ONE
    },
  })
}

async function settled(): Promise<void> {
  await Promise.all(tracked)
}

beforeEach(() => {
  steps = []
  tracked = []
  collapsed = []
  dismissals = 0
  emptiedTheWorkspace = 0
})

describe('an empty primary pane', () => {
  it('pulls the second pane onto itself when that one still holds tabs', () => {
    const primary = fake('primary')
    const aside = fake('aside', { tabs: [ELSEWHERE] })

    surfacesOf(primary, aside).settlePane(primary.surface)

    expect(collapsed).toStrictEqual(['aside'])
  })

  it('shows the empty workspace when there is no second pane to pull across', () => {
    const primary = fake('primary')

    surfacesOf(primary, null).settlePane(primary.surface)

    expect(steps).toStrictEqual(['primary released', `primary showed empty at the root`])
  })

  it('shows the empty workspace when the second pane holds nothing either', () => {
    const primary = fake('primary')

    surfacesOf(primary, fake('aside')).settlePane(primary.surface)

    expect(steps.at(-1)).toBe('primary showed empty at the root')
  })
})

describe('an empty second pane', () => {
  it('is dismissed rather than left showing nothing', () => {
    const aside = fake('aside')

    surfacesOf(fake('primary', { tabs: [ELSEWHERE] }), aside).settlePane(aside.surface)

    expect(dismissals).toBe(ONE)
  })
})

describe('a pane that still holds something', () => {
  it('shows whatever it is on', async () => {
    const primary = fake('primary', { tabs: [ELSEWHERE] })

    surfacesOf(primary, null).settlePane(primary.surface)

    await settled()

    expect(steps).toStrictEqual([`primary showed ${tabIdentity(ELSEWHERE)}`])
  })
})

describe('closing a tab in a pane', () => {
  it('reaches the closing machinery with the surface it was given', () => {
    const primary = fake('primary', { tabs: [PREVIEW, ELSEWHERE] })

    surfacesOf(primary, null).requestClose(primary.surface, PREVIEW)

    expect(steps.at(0)).toBe(`primary closed ${tabIdentity(PREVIEW)}`)
  })
})

describe('releasing a tab the other pane has taken', () => {
  it('does nothing when there is no pane to release from', async () => {
    await surfacesOf(fake('primary'), null).releaseFrom(null, EDITOR)

    expect(steps).toStrictEqual([])
  })

  it('does nothing when that pane never held the tab', async () => {
    const aside = fake('aside', { tabs: [ELSEWHERE] })

    await surfacesOf(fake('primary'), aside).releaseFrom(aside.surface, EDITOR)

    expect(steps).toStrictEqual([])
  })

  it('saves the document before letting the editor go', async () => {
    const aside = fake('aside', { tabs: [EDITOR] })

    await surfacesOf(fake('primary', { tabs: [ELSEWHERE] }), aside).releaseFrom(aside.surface, EDITOR)

    expect(steps.at(0)).toBe('aside flushed')
  })

  it('does not flush for a preview, which holds nothing to save', async () => {
    const aside = fake('aside', { tabs: [PREVIEW, ELSEWHERE] })

    await surfacesOf(fake('primary'), aside).releaseFrom(aside.surface, PREVIEW)

    expect(steps.at(0)).toBe(`aside closed ${tabIdentity(PREVIEW)}`)
  })

  it('settles the pane it took the tab from', async () => {
    const aside = fake('aside', { tabs: [PREVIEW] })

    await surfacesOf(fake('primary', { tabs: [ELSEWHERE] }), aside).releaseFrom(aside.surface, PREVIEW)

    expect(dismissals).toBe(ONE)
  })
})

describe('handing a document from one pane to the other', () => {
  it('passes the live buffer across when the pane had one to give', () => {
    const carried = cast<Carried>({})
    const leaving = fake('leaving', { carries: carried })
    const arriving = fake('arriving')

    surfacesOf(arriving, leaving).handOverTo(arriving.surface, EDITOR, leaving.surface)

    expect(steps).toStrictEqual(['leaving handed over', `arriving adopted ${EDITOR.path}`])
  })

  it('opens the document afresh when there was no buffer to carry', async () => {
    const leaving = fake('leaving')
    const arriving = fake('arriving')

    surfacesOf(arriving, leaving).handOverTo(arriving.surface, EDITOR, leaving.surface)

    await settled()

    expect(steps).toStrictEqual(['leaving handed over', `arriving opened ${EDITOR.path}`])
  })
})

describe('a tab carried between panes', () => {
  it('saves the document, hands it over, then settles the pane it left', async () => {
    const leaving = fake('leaving', { tabs: [EDITOR], carries: cast<Carried>({}) })
    const arriving = fake('arriving', { tabs: [ELSEWHERE] })
    surfacesOf(arriving, leaving).settleCarry(EDITOR, arriving.surface, leaving.surface)

    await settled()

    expect(steps.slice(0, 3)).toStrictEqual([
      'leaving flushed',
      'leaving handed over',
      `arriving adopted ${EDITOR.path}`,
    ])
  })

  it('settles the pane it left when what moved was not an editor', () => {
    const leaving = fake('leaving')
    const arriving = fake('arriving', { tabs: [ELSEWHERE] })

    surfacesOf(arriving, leaving).settleCarry(PREVIEW, arriving.surface, leaving.surface)

    expect(dismissals).toBe(ONE)
  })

  it('settles the pane it arrived in too', async () => {
    const leaving = fake('leaving')
    const arriving = fake('arriving', { tabs: [ELSEWHERE] })
    surfacesOf(arriving, leaving).settleCarry(PREVIEW, arriving.surface, leaving.surface)

    await settled()

    expect(steps).toStrictEqual(['leaving released', `arriving showed ${tabIdentity(ELSEWHERE)}`])
  })

  it('leaves a pane that is no longer open alone, rather than settling a detached one', async () => {
    const leaving = fake('leaving')
    const stranger = fake('stranger', { tabs: [ELSEWHERE] })
    surfacesOf(fake('primary', { tabs: [ELSEWHERE] }), leaving).settleCarry(PREVIEW, stranger.surface, leaving.surface)

    await settled()

    expect(steps.filter((step) => step.startsWith('stranger'))).toStrictEqual([])
  })

  it('settles the pane it left even when nothing moved at all', () => {
    const leaving = fake('leaving')
    const arriving = fake('arriving', { tabs: [ELSEWHERE] })

    surfacesOf(arriving, leaving).settleCarry(null, arriving.surface, leaving.surface)

    expect(dismissals).toBe(ONE)
  })
})

describe('a tab dropped into a pane', () => {
  it('takes it out of the pane it came from and puts it where it was dropped', () => {
    const leaving = fake('leaving', { tabs: [EDITOR] })
    const arriving = fake('arriving')

    surfacesOf(arriving, leaving).tabArrived(tabIdentity(EDITOR), arriving.surface, leaving.surface, AT_THE_END)

    expect(steps.slice(0, 2)).toStrictEqual([
      `leaving closed ${tabIdentity(EDITOR)}`,
      `arriving received ${tabIdentity(EDITOR)} at ${String(AT_THE_END)}`,
    ])
  })

  it('leaves both panes alone when the identity names no tab it can carry', () => {
    const leaving = fake('leaving')
    const arriving = fake('arriving')

    surfacesOf(arriving, leaving).tabArrived('not-an-identity', arriving.surface, leaving.surface, AT_THE_END)

    expect(steps.filter((step) => step.includes('received'))).toStrictEqual([])
  })
})

describe('the whole workspace emptying out', () => {
  it('says so once every pane is empty', () => {
    const primary = fake('primary')

    surfacesOf(primary, null).settlePane(primary.surface)

    expect(emptiedTheWorkspace).toBe(ONE)
  })

  it('says nothing of the sort while a pane still holds a tab', () => {
    const primary = fake('primary')

    surfacesOf(primary, fake('aside', { tabs: [ELSEWHERE] })).settlePane(primary.surface)

    expect(emptiedTheWorkspace).toBe(0)
  })
})

describe('closing whatever is in front', () => {
  it('closes the tab the front pane is showing', () => {
    const primary = fake('primary', { tabs: [PREVIEW, ELSEWHERE] })

    surfacesOf(primary, null).closeTheTabInFront()

    expect(steps.at(0)).toBe(`primary closed ${tabIdentity(PREVIEW)}`)
  })
})

describe('the trash being emptied', () => {
  it('closes a tab left showing a purged entry', () => {
    const trashed: TabAt = { path: 'gone.md', view: 'deleted' }
    const primary = fake('primary', { tabs: [trashed, ELSEWHERE] })

    surfacesOf(primary, null).closeTrashTabs()

    expect(steps.at(0)).toBe(`primary closed ${tabIdentity(trashed)}`)
  })
})

describe('waiting for the closes a gesture set off', () => {
  it('settles when nothing was asked of it', async () => {
    await expect(surfacesOf(fake('primary'), null).settled()).resolves.toBeUndefined()
  })
})
