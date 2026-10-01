'use sanity'

import { given } from '../conditions.ts'
import { beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { LoadedDocument, Session } from '../../src/client/editor/session.ts'

import type { EditorView } from '@codemirror/view'

import { DocumentRequestError } from '../../src/client/editor/document-client.ts'
import type { Dialogs } from '../../src/client/files/dialogs.ts'
import type { FilesClient } from '../../src/client/files/files-client.ts'
import { cast } from '../cast.ts'

import { page, pressSave, recorded, sessionRecording, type Recorded } from './editor-fixtures.ts'

const { bootstrap } = TestOnly

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()
let wake: () => void = () => undefined
let afterTheCheck: () => Promise<void> = () => Promise.resolve()

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

async function editing(reread: () => Promise<LoadedDocument | null>): Promise<ReturnType<typeof bootstrap>> {
  return await bootstrap({
    root,
    pathname: '/doc/notes.md',
    session: fakeSession({ load: () => Promise.resolve({ content: '# stored', stored: true }), reread }),
    listenForFocus: (registered, settled) => {
      wake = registered
      afterTheCheck = settled

      return () => undefined
    },
  })
}

function statusText(): string {
  return [...root.querySelectorAll('#status .toast')].at(-1)?.textContent ?? ''
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
  wake = () => undefined
  afterTheCheck = () => Promise.resolve()
})

describe('a clean buffer when the document changes on disk', () => {
  it('reloads, so the editor shows what is actually stored', async () => {
    const view = await editing(() => Promise.resolve({ content: '# changed elsewhere', stored: true }))

    wake()

    await afterTheCheck()

    expect(view.state.doc.toString()).toBe('# changed elsewhere')
  })

  it('says it reloaded, rather than the text changing silently', async () => {
    await editing(() => Promise.resolve({ content: '# changed elsewhere', stored: true }))

    wake()

    await afterTheCheck()

    expect(statusText()).toContain('changed on disk — reloaded')
  })

  it('keeps the caret where it was, so the reader does not lose their place', async () => {
    const view = await editing(() => Promise.resolve({ content: '# changed elsewhere', stored: true }))
    view.dispatch({ selection: { anchor: 4 } })

    wake()

    await afterTheCheck()
    given(() => {
      expect(view.state.doc.toString()).toBe('# changed elsewhere')
    })

    expect(view.state.selection.main.head).toBe(4)
  })

  it('clamps the caret when the document shrank underneath it', async () => {
    const view = await editing(() => Promise.resolve({ content: 'x', stored: true }))
    view.dispatch({ selection: { anchor: 6 } })

    wake()

    await afterTheCheck()
    given(() => {
      expect(view.state.doc.toString()).toBe('x')
    })

    expect(view.state.selection.main.head).toBe(1)
  })

  it('leaves the buffer alone when nothing changed', async () => {
    const view = await editing(() => Promise.resolve(null))

    wake()
    await afterTheCheck()

    expect(view.state.doc.toString()).toBe('# stored')
  })

  it('says nothing when nothing changed', async () => {
    await editing(() => Promise.resolve(null))

    wake()
    await afterTheCheck()

    expect(statusText()).not.toContain('reloaded')
  })
})

describe('a dirty buffer when the document changes on disk', () => {
  it('is never replaced, because that would discard unsaved work', async () => {
    const view = await editing(() => Promise.resolve({ content: '# changed elsewhere', stored: true }))
    view.dispatch({ changes: { from: 0, insert: 'mine ' } })

    wake()

    await afterTheCheck()
    given(() => {
      expect(statusText()).toContain('can no longer be saved')
    })

    expect(view.state.doc.toString()).toBe('mine # stored')
  })
})

describe('a check that cannot be made', () => {
  it('says nothing when the server cannot be reached', async () => {
    await editing(() => Promise.reject(new Error('network down')))

    wake()

    await afterTheCheck()

    expect(statusText()).not.toContain('reloaded')
  })

  it('is not made at all while the workspace is showing something other than a document', async () => {
    const asked: string[] = []
    await bootstrap({
      root,
      pathname: '/doc/gone.md',
      session: fakeSession({
        load: () => Promise.resolve({ content: '', stored: false }),
        reread: (id: string) => {
          asked.push(id)

          return Promise.resolve(null)
        },
      }),
      listenForFocus: (registered, settled) => {
        wake = registered
        afterTheCheck = settled

        return () => undefined
      },
    })

    wake()
    await afterTheCheck()
    given(() => {
      expect(root.querySelector<HTMLElement>('#view-missing')?.hidden).toBe(false)
    })

    expect(asked).toStrictEqual([])
  })
})

describe('a check while a save is in flight', () => {
  it('is skipped, or it could observe a half-written document', async () => {
    const asked: string[] = []
    const hanging: PromiseWithResolvers<void> = Promise.withResolvers()
    const saving: PromiseWithResolvers<void> = Promise.withResolvers()
    const view = await bootstrap({
      root,
      pathname: '/doc/notes.md',
      session: fakeSession({
        load: () => Promise.resolve({ content: '# stored', stored: true }),
        save: () => {
          saving.resolve()

          return hanging.promise
        },
        reread: (id: string) => {
          asked.push(id)

          return Promise.resolve(null)
        },
      }),
      listenForFocus: (registered, settled) => {
        wake = registered
        afterTheCheck = settled

        return () => undefined
      },
    })

    view.dispatch({ changes: { from: 0, insert: 'mine ' } })
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }),
    )
    await saving.promise
    given(() => {
      expect(root.querySelector('#save-label')?.textContent).toBe('Saving…')
    })

    wake()
    await afterTheCheck()
    given(() => {
      expect(root.querySelector('#save-label')?.textContent).toBe('Saving…')
    })

    expect(asked).toStrictEqual([])
    hanging.resolve()
  })
})

interface Chooser {
  dialogs: Dialogs
  offered: number
  created: Array<{ entryPath: string; content: string | undefined }>
}

function choosing(chosen: string | null, keptAs = 'notes-mine.md'): Chooser {
  const state: Chooser = {
    offered: 0,
    created: [],
    dialogs: cast<Dialogs>({}),
  }

  state.dialogs = cast<Dialogs>({
    choose: (): Promise<string | null> => {
      state.offered += 1

      return Promise.resolve(chosen)
    },
    prompt: async (request: { submit: (value: string) => Promise<string | null> }): Promise<boolean> =>
      (await request.submit(keptAs)) === null,
    confirm: (): Promise<boolean> => Promise.resolve(false),
  })

  return state
}

function filesRecording(into: Array<{ entryPath: string; content: string | undefined }>): FilesClient {
  return cast<FilesClient>({
    createDocument: (entryPath: string, content?: string): Promise<void> => {
      into.push({ entryPath, content })

      return Promise.resolve()
    },
  })
}

async function dirtyAgainst(theirs: string, chooser: Chooser, save?: Session['save']): Promise<EditorView> {
  const view = await bootstrap({
    root,
    pathname: '/doc/notes.md',
    dialogs: chooser.dialogs,
    files: filesRecording(chooser.created),
    session: fakeSession({
      load: () => Promise.resolve({ content: '# stored', stored: true }),
      reread: () => Promise.resolve({ content: theirs, stored: true }),
      ...(save === undefined ? {} : { save }),
    }),
    listenForFocus: (registered, settled) => {
      wake = registered
      afterTheCheck = settled

      return () => undefined
    },
  })

  view.dispatch({ changes: { from: 0, insert: 'mine ' } })

  return view
}

describe('resolving a conflict on a dirty buffer', () => {
  it('offers a choice rather than only reporting the collision', async () => {
    const chooser = choosing(null)
    await dirtyAgainst('# theirs', chooser)

    wake()

    await afterTheCheck()

    expect(chooser.offered).toBe(1)
  })

  it('takes theirs by replacing the buffer with what is stored', async () => {
    const view = await dirtyAgainst('# theirs', choosing('theirs'))

    wake()

    await afterTheCheck()

    expect(view.state.doc.toString()).toBe('# theirs')
  })

  it('keeps mine by saving the buffer over what is stored', async () => {
    await dirtyAgainst('# theirs', choosing('mine'))

    wake()

    await afterTheCheck()

    expect(record.saved).toStrictEqual([{ id: 'notes.md', content: 'mine # stored' }])
  })

  it('keeps both by writing the buffer to a second document', async () => {
    const chooser = choosing('both')
    await dirtyAgainst('# theirs', chooser)

    wake()

    await afterTheCheck()

    expect(chooser.created).toStrictEqual([{ entryPath: 'notes-mine.md', content: 'mine # stored' }])
  })

  it('then loads the stored version into the buffer, so the copy is the only stale one', async () => {
    const chooser = choosing('both')
    const view = await dirtyAgainst('# theirs', chooser)

    wake()

    await afterTheCheck()
    given(() => {
      expect(chooser.created).toHaveLength(1)
    })

    expect(view.state.doc.toString()).toBe('# theirs')
  })

  it('merges by marking the stored version against the buffer in the editor', async () => {
    const view = await dirtyAgainst('# theirs', choosing('merge'))

    wake()

    await afterTheCheck()

    expect(view.dom.querySelectorAll('.cm-changedLine').length).toBeGreaterThan(0)
  })

  it('shows the stored version as the side to be accepted or rejected', async () => {
    const view = await dirtyAgainst('# theirs', choosing('merge'))

    wake()

    await afterTheCheck()
    given(() => {
      expect(view.dom.querySelectorAll('.cm-changedLine').length).toBeGreaterThan(0)
    })

    expect(view.dom.querySelector('.cm-deletedChunk')?.textContent).toContain('# theirs')
  })

  it('keeps the buffer as the editable side while the merge is open', async () => {
    const view = await dirtyAgainst('# theirs', choosing('merge'))

    wake()

    await afterTheCheck()
    given(() => {
      expect(view.dom.querySelectorAll('.cm-changedLine').length).toBeGreaterThan(0)
    })

    expect(view.state.doc.toString()).toContain('mine')
  })

  it('drops the markers once no change is left to decide', async () => {
    const view = await dirtyAgainst('# theirs', choosing('merge'))

    wake()
    await afterTheCheck()
    given(() => {
      expect(view.dom.querySelectorAll('.cm-changedLine').length).toBeGreaterThan(0)
    })

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# theirs' } })

    expect(view.dom.querySelectorAll('.cm-changedLine')).toHaveLength(0)
  })

  it('says the merge is done once no change is left to decide', async () => {
    const view = await dirtyAgainst('# theirs', choosing('merge'))

    wake()
    await afterTheCheck()
    given(() => {
      expect(view.dom.querySelectorAll('.cm-changedLine').length).toBeGreaterThan(0)
    })

    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# theirs' } })

    expect(statusText()).toContain('merged')
  })

  it('still reports the collision when the choice is dismissed', async () => {
    await dirtyAgainst('# theirs', choosing(null))

    wake()

    await afterTheCheck()

    expect(statusText()).toContain('can no longer be saved')
  })
})

describe('a save the store refuses as stale', () => {
  it('offers the same choice at once, rather than waiting for the next check', async () => {
    const chooser = choosing(null)
    const view = await dirtyAgainst('# theirs', chooser, () =>
      Promise.reject(new DocumentRequestError(412, 'Document changed')),
    )

    await pressSave(view)

    await afterTheCheck()

    expect(chooser.offered).toBe(1)
  })

  it('does not offer when the refusal was not a stale token', async () => {
    const chooser = choosing(null)
    const view = await dirtyAgainst('# theirs', chooser, () => Promise.reject(new DocumentRequestError(503, 'Busy')))

    await pressSave(view)
    await afterTheCheck()

    expect(chooser.offered).toBe(0)
  })
})
