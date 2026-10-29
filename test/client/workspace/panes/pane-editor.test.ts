'use sanity'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createPaneEditor } from '../../../../src/client/workspace/panes/pane-editor.ts'
import { createCaretMemory } from '../../../../src/client/document/caret-memory.ts'
import type { DocumentTab } from '../../../../src/client/document/document-tab.ts'
import type { Pane } from '../../../../src/client/workspace/panes/pane.ts'
import type { Previews } from '../../../../src/client/preview/previews.ts'
import type { StatusBar } from '../../../../src/client/workspace/panes/status-bar.ts'
import type { TabAt } from '../../../../src/client/workspace/tabs/open-tabs.ts'
import type { Toast } from '../../../../src/client/platform/toast.ts'

import { cast } from '../../../cast.ts'
import { given } from '../../../conditions.ts'
import { dialogsDismissing, filesAnsweringEmpty, recorded, sessionRecording } from '../../editor-fixtures.ts'

const OPEN_DOCUMENT = 'journal/notes.md'
const A_CARET = 3

interface Refreshed {
  holder: string | null
  content: string
}

interface Revealed {
  holder: string | null
  offset: number
}

let refreshed: Refreshed[] = []
let revealed: Revealed[] = []
let kept: TabAt[] = []
let opened: DocumentTab[] = []
let told = 0

function paneEditor(holds: string | null = OPEN_DOCUMENT): DocumentTab {
  const mount = document.createElement('div')
  document.body.append(mount)

  const tab = createPaneEditor({
    mount,
    pane: cast<Pane>({
      keepWhenOpened: (at: TabAt) => {
        kept.push(at)
      },
    }),
    previews: cast<Previews>({
      refreshWith: (holder: string | null, content: string) => {
        refreshed.push({ holder, content })
      },
      revealOffset: (holder: string | null, offset: number) => {
        revealed.push({ holder, offset })
      },
    }),
    session: sessionRecording(recorded()),
    files: filesAnsweringEmpty(),
    dialogs: dialogsDismissing(),
    toast: cast<Toast>({ show: () => undefined, error: () => undefined }),
    statusBar: cast<StatusBar>({
      showSaveState: () => undefined,
      showWordCount: () => undefined,
      forgetSaveState: () => undefined,
    }),
    caretMemory: createCaretMemory(),
    documentId: () => holds,
    openUrl: () => undefined,
    announce: () => undefined,
    onStored: () => undefined,
    showingDocument: () => true,
    onContentChanged: () => {
      told += 1
    },
  })

  opened.push(tab)

  return tab
}

beforeEach(() => {
  document.body.innerHTML = ''
  refreshed = []
  revealed = []
  kept = []
  opened = []
  told = 0
})

afterEach(() => {
  for (const tab of opened) tab.teardownDocument()
})

describe('typing into a pane', () => {
  it('sends what was typed to the previews of that document', () => {
    const tab = paneEditor()
    refreshed = []

    tab.insertAt('# typed', null)

    expect(refreshed.at(-1)).toStrictEqual({ holder: OPEN_DOCUMENT, content: '# typed' })
  })

  it('keeps the tab, because an edit is what turns a glance into work', () => {
    const tab = paneEditor()
    kept = []

    tab.insertAt('x', null)

    expect(kept).toStrictEqual([{ path: OPEN_DOCUMENT, view: 'editor' }])
  })

  it('keeps nothing when the pane holds no document to keep', () => {
    const tab = paneEditor(null)
    kept = []

    tab.insertAt('x', null)

    expect(kept).toStrictEqual([])
  })

  it('still tells the previews, so an empty pane does not leave a stale preview behind', () => {
    const tab = paneEditor(null)
    refreshed = []

    tab.insertAt('x', null)

    expect(refreshed.at(-1)).toStrictEqual({ holder: null, content: 'x' })
  })
})

describe('what a pane tells the rest of the app about its text', () => {
  const ONCE = 1

  it('says the text changed when the reader types, so a panel reading it can redraw', () => {
    const tab = paneEditor()
    told = 0

    tab.insertAt('# typed', null)

    expect(told).toBe(ONCE)
  })

  it('says the same when the document is loaded under them, which changes the text just as much', () => {
    const tab = paneEditor()
    told = 0

    tab.load('# from the store')

    expect(told).toBe(ONCE)
  })
})

describe('a document loaded into a pane', () => {
  it('sends what was loaded to the previews', () => {
    const tab = paneEditor()
    refreshed = []

    tab.load('# from the store')

    expect(refreshed.at(-1)).toStrictEqual({ holder: OPEN_DOCUMENT, content: '# from the store' })
  })

  it('keeps nothing, because a load is not an edit the reader made', () => {
    const tab = paneEditor()
    given(() => {
      expect(kept).toStrictEqual([])
    })

    tab.load('# from the store')

    expect(kept).toStrictEqual([])
  })
})

describe('moving the caret in a pane', () => {
  it('scrolls the previews of that document to where the caret went', () => {
    const tab = paneEditor()
    tab.load('a document long enough to have offsets')
    revealed = []

    tab.putCaretAt(A_CARET)

    expect(revealed.at(-1)).toStrictEqual({ holder: OPEN_DOCUMENT, offset: A_CARET })
  })
})
