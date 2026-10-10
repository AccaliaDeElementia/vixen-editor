'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { createPreviewing } from '../../../src/client/preview/previewing.ts'
import { docUrlFor } from '../../../src/client/platform/doc-path.ts'
import type { TabAt } from '../../../src/client/workspace/tabs/open-tabs.ts'
import type { PaneWorkspace } from '../../../src/client/workspace/panes/pane-workspace.ts'
import type { Pane } from '../../../src/client/workspace/panes/pane.ts'

import { cast } from '../../cast.ts'

const OPEN_DOCUMENT = 'journal/notes.md'

interface Previewed {
  summons?: boolean
  keptEditor?: boolean
  showingDocument?: boolean
  alreadyOpen?: boolean
}

let steps: string[] = []
let released: TabAt[] = []
let visited: string[] = []

function target(): PaneWorkspace {
  return cast<PaneWorkspace>({
    pane: cast<Pane>({
      keep: (at: TabAt) => steps.push(`kept ${at.view}`),
      open: (at: TabAt) => steps.push(`opened ${at.view}`),
    }),
  })
}

function previewing({
  summons = true,
  keptEditor = false,
  showingDocument = true,
  alreadyOpen = false,
}: Previewed = {}): ReturnType<typeof createPreviewing> {
  const summoned = target()

  return createPreviewing({
    holdsPermanently: () => keptEditor,
    summon: () => (summons ? summoned : null),
    showWhereItIs: (at: TabAt) => {
      if (!alreadyOpen) return false

      steps.push(`brought ${at.view} forward`)

      return true
    },
    releaseElsewhere: (at: TabAt) => {
      released.push(at)
    },
    documentId: () => OPEN_DOCUMENT,
    showingDocument: () => showingDocument,
    show: (surface: PaneWorkspace, at: TabAt) => {
      steps.push(`showed ${at.view} in ${surface === summoned ? 'the summoned pane' : 'some other pane'}`)
    },
    navigate: (url: string) => {
      visited.push(url)
    },
  })
}

beforeEach(() => {
  steps = []
  released = []
  visited = []
})

describe('asking for a preview', () => {
  it('opens one of the source', () => {
    previewing().showSource()

    expect(steps).toStrictEqual(['opened source', 'showed source in the summoned pane'])
  })

  it('opens one of the formatted markup', () => {
    previewing().showMarkup()

    expect(steps).toStrictEqual(['opened markup', 'showed markup in the summoned pane'])
  })

  it('previews the document that is open, not whatever the tree has selected', () => {
    previewing().showMarkup()

    expect(released).toStrictEqual([{ path: OPEN_DOCUMENT, view: 'markup' }])
  })

  it('goes to the url that names the preview, so it survives a reload', () => {
    previewing().showMarkup()

    expect(visited).toStrictEqual([docUrlFor(OPEN_DOCUMENT, 'markup')])
  })

  it('takes it out of the other pane first, so the same preview is not open twice', () => {
    previewing().showSource()

    expect(released).toStrictEqual([{ path: OPEN_DOCUMENT, view: 'source' }])
  })

  it('does nothing at all when there is no pane to put it in', () => {
    previewing({ summons: false }).showMarkup()

    expect({ steps, released, visited }).toStrictEqual({ steps: [], released: [], visited: [] })
  })
})

describe('how long the preview stays', () => {
  it('is kept when the document it previews was kept, so the next open does not replace it', () => {
    previewing({ keptEditor: true }).showMarkup()

    expect(steps.at(0)).toBe('kept markup')
  })

  it('is only looked at when the document it previews is only being looked at', () => {
    previewing({ keptEditor: false }).showMarkup()

    expect(steps.at(0)).toBe('opened markup')
  })
})

describe('a preview the url asked for', () => {
  it('opens it when nothing is showing it yet', () => {
    previewing().showNamedByUrl('source')

    expect(steps).toStrictEqual(['opened source', 'showed source in the summoned pane'])
  })

  it('brings the one already open forward rather than opening a second', () => {
    previewing({ alreadyOpen: true }).showNamedByUrl('source')

    expect(steps).toStrictEqual(['brought source forward'])
  })

  it('navigates nowhere when it only brought an open one forward, since the url already says so', () => {
    previewing({ alreadyOpen: true }).showNamedByUrl('source')

    expect(visited).toStrictEqual([])
  })

  it('does nothing for a view that is not a preview at all', () => {
    previewing().showNamedByUrl('editor')

    expect(steps).toStrictEqual([])
  })

  it('does nothing while the workspace is showing something other than a document', () => {
    previewing({ showingDocument: false }).showNamedByUrl('markup')

    expect(steps).toStrictEqual([])
  })
})
