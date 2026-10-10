'use sanity'

import type { EditorState } from '@codemirror/state'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createDocumentTab, TestOnly, type DocumentTab } from '../../../src/client/document/document-tab.ts'
import { createCaretMemory } from '../../../src/client/document/caret-memory.ts'
import { createEditorState } from '../../../src/client/editing/markdown-setup.ts'
import type { StatusBar } from '../../../src/client/workspace/panes/status-bar.ts'
import type { Dialogs } from '../../../src/client/platform/dialogs.ts'
import type { Session } from '../../../src/client/document/session.ts'
import type { Toast } from '../../../src/client/platform/toast.ts'

import { cast } from '../../cast.ts'
import { given } from '../../conditions.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  recorded,
  sessionRecording,
  type Recorded,
} from '../editor-fixtures.ts'

const FIRST = 'journal/first.md'
const SECOND = 'journal/second.md'
const { startsALine } = TestOnly

const TOP = 0
const A_CARET = 4

interface Driving {
  session?: Partial<Session>
  dialogs?: Partial<Dialogs>
  showing?: boolean
}

let opened: DocumentTab[] = []
let reloaded: string[] = []
let errors: string[] = []
let announced: string[] = []
let store: Recorded = recorded()

function tab({ session = {}, dialogs = {}, showing = true }: Driving = {}): DocumentTab {
  const mount = document.createElement('div')
  document.body.append(mount)

  const made = createDocumentTab({
    mount,
    session: sessionRecording(store, session),
    files: filesAnsweringEmpty(),
    dialogs: { ...dialogsDismissing(), ...dialogs },
    toast: cast<Toast>({
      show: () => undefined,
      error: (message: string) => {
        errors.push(message)
      },
    }),
    statusBar: cast<StatusBar>({
      showSaveState: () => undefined,
      showWordCount: () => undefined,
      forgetSaveState: () => undefined,
    }),
    caretMemory: createCaretMemory(),
    documentId: () => made.holding(),
    openUrl: () => undefined,
    announce: (text: string) => {
      announced.push(text)
    },
    onStored: () => undefined,
    showingDocument: () => showing,
    onEdited: () => undefined,
    onReloaded: (content: string) => {
      reloaded.push(content)
    },
    onCaretMoved: () => undefined,
  })
  opened.push(made)

  return made
}

function text(of: DocumentTab): string {
  return of.view.state.doc.toString()
}

function stateWith(doc: string): EditorState {
  return createEditorState({ doc })
}

beforeEach(() => {
  localStorage.clear()
  document.body.innerHTML = ''
  opened = []
  reloaded = []
  errors = []
  announced = []
  store = recorded()
})

afterEach(() => {
  for (const made of opened) made.teardownDocument()
})

describe('whether a position is at the start of a line', () => {
  it('counts the top of the document', () => {
    expect(startsALine(stateWith('one\ntwo'), TOP)).toBe(true)
  })

  it('counts the start of a later line', () => {
    expect(startsALine(stateWith('one\ntwo'), A_CARET)).toBe(true)
  })

  it('does not count a position part way along a line', () => {
    expect(startsALine(stateWith('one\ntwo'), 2)).toBe(false)
  })

  it('counts no position at all, so a drop that landed nowhere still breaks the line', () => {
    expect(startsALine(stateWith('one'), null)).toBe(true)
  })
})

describe('opening a document', () => {
  it('holds the path it was opened on', () => {
    const made = tab()

    made.open(FIRST, '# first')

    expect(made.holding()).toBe(FIRST)
  })

  it('shows what the store gave it', () => {
    const made = tab()

    made.open(FIRST, '# first')

    expect(text(made)).toBe('# first')
  })

  it('starts at the top of a document it has never shown before', () => {
    const made = tab()

    made.open(FIRST, '# first\nand more')

    expect(made.caret()).toBe(TOP)
  })

  it('comes back to where the reader left off, so switching away and back is not a jump', () => {
    const made = tab()
    made.open(FIRST, '# first\nand more')
    made.putCaretAt(A_CARET)
    made.open(SECOND, '# second')

    made.open(FIRST, '# first\nand more')

    expect(made.caret()).toBe(A_CARET)
  })

  it('reuses the buffer it already had, so a selection survives switching away and back', () => {
    const made = tab()
    made.open(FIRST, '# first')
    made.view.dispatch({ selection: { anchor: 2, head: A_CARET } })
    made.open(SECOND, '# second')

    made.open(FIRST, '# first')

    expect(made.view.state.selection.main.anchor).toBe(2)
  })

  it('starts afresh when the store has moved on, so a stale buffer cannot hide a changed file', () => {
    const made = tab()
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)
    made.open(SECOND, '# second')

    made.open(FIRST, '# first changed on disk')

    expect(text(made)).toBe('# first changed on disk')
  })
})

describe('loading a document over the one on screen', () => {
  it('shows what came back from the store', () => {
    const made = tab()
    made.open(FIRST, '# first')

    made.load('# from the store')

    expect(text(made)).toBe('# from the store')
  })

  it('tells whoever is listening, so a preview follows the reload', () => {
    const made = tab()
    made.open(FIRST, '# first')
    reloaded = []

    made.load('# from the store')

    expect(reloaded).toStrictEqual(['# from the store'])
  })

  it('pulls the caret back inside text that got shorter', () => {
    const made = tab()
    made.open(FIRST, '# a long first document')
    made.putCaretAt('# a long first document'.length)

    made.load('short')

    expect(made.caret()).toBe('short'.length)
  })
})

describe('emptying the pane', () => {
  it('shows nothing at all', () => {
    const made = tab()
    made.open(FIRST, '# first')

    made.empty()

    expect(text(made)).toBe('')
  })
})

describe('carrying a document to the other pane', () => {
  it('hands over the text as it stands, unsaved edits and all', () => {
    const made = tab()
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)

    expect(made.handOver().state.doc.toString()).toContain('edited')
  })

  it('hands over what the store last held, so the arriving pane knows what is unsaved', () => {
    const made = tab()
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)

    expect(made.handOver().storedContent).toBe('# first')
  })

  it('leaves the pane it came from empty', () => {
    const made = tab()
    made.open(FIRST, '# first')

    made.handOver()

    expect(text(made)).toBe('')
  })

  it('holds nothing once it has handed over', () => {
    const made = tab()
    made.open(FIRST, '# first')

    made.handOver()

    expect(made.holding()).toBeNull()
  })

  it('shows the carried text in the pane that adopts it', () => {
    const leaving = tab()
    const arriving = tab()
    leaving.open(FIRST, '# first')
    leaving.insertAt(' edited', null)

    arriving.adopt(FIRST, leaving.handOver())

    expect(text(arriving)).toContain('edited')
  })

  it('adopts the unsaved state too, so the arriving pane knows there is something to save', () => {
    const leaving = tab()
    const arriving = tab()
    leaving.open(FIRST, '# first')
    leaving.insertAt(' edited', null)

    arriving.adopt(FIRST, leaving.handOver())

    expect(arriving.saveState()).not.toBe('clean')
  })

  it('holds the path it adopted', () => {
    const leaving = tab()
    const arriving = tab()
    leaving.open(FIRST, '# first')

    arriving.adopt(FIRST, leaving.handOver())

    expect(arriving.holding()).toBe(FIRST)
  })
})

describe('the caret', () => {
  it('is at the top of a document just opened', () => {
    const made = tab()
    made.open(FIRST, '# first')

    expect(made.caret()).toBe(TOP)
  })

  it('goes where it is put', () => {
    const made = tab()
    made.open(FIRST, '# a first document')

    made.putCaretAt(A_CARET)

    expect(made.caret()).toBe(A_CARET)
  })
})

describe('inserting text', () => {
  it('puts it where it was asked to', () => {
    const made = tab()
    made.open(FIRST, 'abcdef')

    made.insertAt('X', 2)

    expect(text(made)).toBe('abXcdef')
  })

  it('puts it at the caret when it was given no position', () => {
    const made = tab()
    made.open(FIRST, 'abcdef')
    made.putCaretAt(2)
    given(() => {
      expect(made.caret()).toBe(2)
    })

    made.insertAt('X', null)

    expect(text(made)).toBe('abXcdef')
  })
})

describe('inserting after a reload', () => {
  it('lands inside the new text, because the caret it reports was pulled back with it', () => {
    const made = tab()
    made.open(FIRST, '# a long first document')
    made.putCaretAt('# a long first document'.length)
    made.load('short')

    made.insertAt('X', made.caret())

    expect(text(made)).toBe('shortX')
  })
})

describe('a document that moved underneath the pane', () => {
  it('resolves its links against the path it moved to', () => {
    const made = tab()
    made.open(FIRST, '# first')

    made.followMove(SECOND)

    expect(made.view.contentDOM.getAttribute('aria-label')).toBe(SECOND)
  })
})

const REFUSING_TO_SAVE = {
  save: async (): Promise<never> => await Promise.reject(new Error('the store said no')),
}

describe('saving what the reader typed', () => {
  it('starts out with nothing to save', () => {
    const made = tab()

    made.open(FIRST, '# first')

    expect(made.saveState()).toBe('clean')
  })

  it('has something to save once the text has changed', () => {
    const made = tab()
    made.open(FIRST, '# first')

    made.insertAt(' edited', null)

    expect(made.saveState()).not.toBe('clean')
  })

  it('writes the text as it stands to the store', async () => {
    const made = tab()
    made.open(FIRST, '# first')
    made.insertAt(' edited', '# first'.length)

    await made.flush()

    expect(store.saved).toStrictEqual([{ id: FIRST, content: '# first edited' }])
  })

  it('has nothing left to save afterwards', async () => {
    const made = tab()
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)

    await made.flush()

    expect(made.saveState()).toBe('clean')
  })

  it('writes nothing when no document is open to write to, however the buffer got its text', async () => {
    const made = tab()
    made.insertAt('typed with nothing open', null)

    await made.flush()

    expect(store.saved).toStrictEqual([])
  })

  it('says so when the store refused, rather than losing the change silently', async () => {
    const made = tab({ session: REFUSING_TO_SAVE })
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)

    await made.flush()

    expect(errors).toStrictEqual(['Save failed: the store said no'])
  })
})

describe('the page being closed with the document open', () => {
  it('writes what is in the buffer on the way out', () => {
    const made = tab()
    made.open(FIRST, '# first')
    made.insertAt(' edited', '# first'.length)

    made.rescue()

    expect(store.rescued).toStrictEqual([{ id: FIRST, content: '# first edited' }])
  })

  it('writes nothing when the buffer holds only whitespace, which the store refuses anyway', () => {
    const made = tab()
    made.open(FIRST, '   ')

    made.rescue()

    expect(store.rescued).toStrictEqual([])
  })

  it('writes nothing when no document is open', () => {
    const made = tab()

    made.rescue()

    expect(store.rescued).toStrictEqual([])
  })
})

describe('leaving a document behind', () => {
  it('lets the reader go when everything was saved', async () => {
    const made = tab()
    made.open(FIRST, '# first')

    await expect(made.settleBeforeLeaving()).resolves.toBe(true)
  })

  it('keeps them here when they decline to discard a change that would not save', async () => {
    const made = tab({ session: REFUSING_TO_SAVE, dialogs: { confirm: async () => await Promise.resolve(false) } })
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)

    await expect(made.settleBeforeLeaving()).resolves.toBe(false)
  })

  it('lets them go once they have chosen to discard it', async () => {
    const made = tab({ session: REFUSING_TO_SAVE, dialogs: { confirm: async () => await Promise.resolve(true) } })
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)

    await expect(made.settleBeforeLeaving()).resolves.toBe(true)
  })

  it('forgets the change they discarded, so nothing asks about it again', async () => {
    const made = tab({ session: REFUSING_TO_SAVE, dialogs: { confirm: async () => await Promise.resolve(true) } })
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)

    await made.settleBeforeLeaving()

    expect(made.saveState()).toBe('clean')
  })
})

describe('a document that changed on disk', () => {
  const REREAD = { reread: async () => await Promise.resolve({ content: '# changed elsewhere', stored: true }) }

  it('is reloaded when nothing of the reader’s would be lost', async () => {
    const made = tab({ session: REREAD })
    made.open(FIRST, '# first')

    await made.recheck()

    expect(text(made)).toBe('# changed elsewhere')
  })

  it('says so, because the text changing underneath is otherwise unexplained', async () => {
    const made = tab({ session: REREAD })
    made.open(FIRST, '# first')
    announced = []

    await made.recheck()

    expect(announced).toStrictEqual([`${FIRST} changed on disk — reloaded`])
  })

  it('is left alone while the workspace is showing something else', async () => {
    const made = tab({ session: REREAD, showing: false })
    made.open(FIRST, '# first')

    await made.recheck()

    expect(text(made)).toBe('# first')
  })

  it('is left alone when no document is open to check', async () => {
    const made = tab({ session: REREAD })

    await made.recheck()

    expect(announced).toStrictEqual([])
  })

  it('is left alone when the store could not be reached', async () => {
    const made = tab({ session: { reread: async () => await Promise.reject(new Error('offline')) } })
    made.open(FIRST, '# first')

    await made.recheck()

    expect(text(made)).toBe('# first')
  })

  it('is not overwritten while the reader has changes of their own', async () => {
    const made = tab({ session: REREAD })
    made.open(FIRST, '# first')
    made.insertAt(' edited', '# first'.length)

    await made.recheck()

    expect(text(made)).toBe('# first edited')
  })

  it('says the reader’s changes can no longer be saved when they resolve nothing', async () => {
    const made = tab({ session: REREAD })
    made.open(FIRST, '# first')
    made.insertAt(' edited', null)

    await made.recheck()

    expect(errors).toStrictEqual([`${FIRST} changed on disk — your unsaved changes can no longer be saved as they are`])
  })
})
