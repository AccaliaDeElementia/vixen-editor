'use sanity'

import type { EditorView } from '@codemirror/view'
import { beforeEach, describe, expect, it } from 'vitest'

import { createAcrossPanes } from '../../../../src/client/workspace/panes/across-panes.ts'
import type { DocumentTab } from '../../../../src/client/document/document-tab.ts'
import type { PaneWorkspace } from '../../../../src/client/workspace/panes/pane-workspace.ts'
import type { TabAt } from '../../../../src/client/workspace/tabs/open-tabs.ts'

import { cast } from '../../../cast.ts'

const NOTHING = null
const AN_OFFSET = 12

interface Holding {
  holds?: string | null
  holding?: string | null
  content?: string
  tabs?: readonly TabAt[]
}

let carets: Array<{ into: string; at: number }> = []
let shown: TabAt[] = []
let opened: TabAt[] = []
let tracked: Array<Promise<void>> = []

function surface(name: string, { holds = null, holding, content = '', tabs = [] }: Holding = {}): PaneWorkspace {
  const editor = cast<DocumentTab>({
    holding: () => (holding === undefined ? holds : holding),
    view: cast<EditorView>({ state: { doc: { toString: () => content } } }),
    putCaretAt: (at: number) => {
      carets.push({ into: name, at })
    },
  })

  return cast<PaneWorkspace>({
    held: { path: () => holds },
    editor: () => editor,
    pane: {
      held: () => tabs,
      open: (at: TabAt) => {
        opened.push(at)
      },
    },
    showTab: async (at: TabAt) => {
      await Promise.resolve()
      shown.push(at)
    },
  })
}

function panesOf(primary: PaneWorkspace, aside: PaneWorkspace | null): ReturnType<typeof createAcrossPanes> {
  return createAcrossPanes({
    primary,
    aside: () => aside,
    track: (work: Promise<void>) => {
      tracked.push(work)
    },
  })
}

beforeEach(() => {
  carets = []
  shown = []
  opened = []
  tracked = []
})

describe('which panes are open', () => {
  it('is the primary alone while nothing sits beside it', () => {
    const primary = surface('primary')

    expect(panesOf(primary, NOTHING).open()).toStrictEqual([primary])
  })

  it('is both of them, the primary first, once a second pane is summoned', () => {
    const primary = surface('primary')
    const aside = surface('aside')

    expect(panesOf(primary, aside).open()).toStrictEqual([primary, aside])
  })
})

describe('which pane is showing a document', () => {
  const EDITOR_TAB: TabAt = { path: 'notes.md', view: 'editor' }
  const PREVIEW_TAB: TabAt = { path: 'notes.md', view: 'markup' }

  it('is the one holding a tab for it', () => {
    const aside = surface('aside', { tabs: [EDITOR_TAB] })

    expect(panesOf(surface('primary'), aside).showingTheDocument('notes.md')).toBe(aside)
  })

  it('falls back to the primary when neither pane holds it', () => {
    const primary = surface('primary')

    expect(panesOf(primary, surface('aside')).showingTheDocument('notes.md')).toBe(primary)
  })

  it('does not count a preview of it, because a preview is not where a document is edited', () => {
    const primary = surface('primary')

    expect(panesOf(primary, surface('aside', { tabs: [PREVIEW_TAB] })).showingTheDocument('notes.md')).toBe(primary)
  })
})

describe('reading what a pane has in its buffer', () => {
  it('is the text of the editor holding that document', () => {
    const aside = surface('aside', { holds: 'notes.md', content: '# unsaved' })

    expect(panesOf(surface('primary'), aside).contentOf('notes.md')).toBe('# unsaved')
  })

  it('is nothing when no pane holds that document', () => {
    expect(panesOf(surface('primary'), NOTHING).contentOf('notes.md')).toBeNull()
  })

  it('is nothing when the pane has moved on and its editor holds something else', () => {
    const stale = surface('aside', { holds: 'notes.md', holding: 'other.md', content: '# other' })

    expect(panesOf(surface('primary'), stale).contentOf('notes.md')).toBeNull()
  })
})

describe('putting the caret where a preview was clicked', () => {
  it('reaches the editor holding that document', () => {
    panesOf(surface('primary'), surface('aside', { holds: 'notes.md' })).caretInto('notes.md', AN_OFFSET)

    expect(carets).toStrictEqual([{ into: 'aside', at: AN_OFFSET }])
  })

  it('does nothing when no editor holds it, rather than moving the wrong caret', () => {
    panesOf(surface('primary'), NOTHING).caretInto('notes.md', AN_OFFSET)

    expect(carets).toStrictEqual([])
  })
})

describe('showing a tab that is already open somewhere', () => {
  const TAB: TabAt = { path: 'notes.md', view: 'editor' }

  it('says it found it', () => {
    expect(panesOf(surface('primary'), surface('aside', { tabs: [TAB] })).showWhereItIs(TAB)).toBe(true)
  })

  it('brings it to the front of the pane that already holds it', async () => {
    panesOf(surface('primary'), surface('aside', { tabs: [TAB] })).showWhereItIs(TAB)

    await Promise.all(tracked)

    expect(shown).toStrictEqual([TAB])
  })

  it('tracks the showing, so a caller can wait for the pane to catch up', () => {
    panesOf(surface('primary'), surface('aside', { tabs: [TAB] })).showWhereItIs(TAB)

    expect(tracked).toHaveLength(1)
  })

  it('says no when nothing holds it, so the caller opens it somewhere', () => {
    expect(panesOf(surface('primary'), surface('aside')).showWhereItIs(TAB)).toBe(false)
  })

  it('leaves every pane alone when nothing holds it', () => {
    panesOf(surface('primary'), surface('aside')).showWhereItIs(TAB)

    expect(opened).toStrictEqual([])
  })
})
