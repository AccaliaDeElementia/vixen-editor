'use sanity'

const ONE_EDITOR = 1

import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../../../../src/client/editor/session.ts'

import { cast } from '../../../cast.ts'
import type { EditorView } from '@codemirror/view'
import type { Dialogs } from '../../../../src/client/files/dialogs.ts'
import { DocumentRequestError } from '../../../../src/client/editor/document-client.ts'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import { requestKeep } from '../../../../src/client/keep-request.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
  openEditor,
  page,
  recorded,
  sessionRecording,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('leaving a document with unsaved changes', () => {
  interface Driver {
    view: EditorView
    go: (url: string) => void
    asked: string[]
    answered: () => Promise<void>
    settled: () => Promise<void>
    wentOn: () => Promise<void>
  }

  async function editing(overrides: Partial<Session>, answer: boolean): Promise<Driver> {
    const handlers = new Map<string, (event?: unknown) => void>()
    const asked: string[] = []
    const askedFor: PromiseWithResolvers<void> = Promise.withResolvers()
    const navigated: PromiseWithResolvers<void> = Promise.withResolvers()
    let decision: Promise<boolean> = Promise.resolve(answer)

    const view = await openEditor({
      root,
      pathname: '/doc/notes.md',
      session: fakeSession(overrides),
      dialogs: cast<Dialogs>({
        confirm: (request: { message: string }) => {
          asked.push(request.message)
          decision = Promise.resolve(answer)
          askedFor.resolve()

          return decision
        },
      }),
      navigation: cast<Navigation>({
        addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
        removeEventListener: (type: string) => handlers.delete(type),
        canGoBack: false,
        canGoForward: false,
        back: () => undefined,
        forward: () => undefined,
        navigate: () => {
          navigated.resolve()

          return {}
        },
        traverseTo: () => ({}),
      }),
    })

    return {
      view,
      asked,
      answered: async () => {
        await askedFor.promise
      },
      settled: async () => {
        await askedFor.promise
        await decision
      },
      wentOn: async () => {
        await navigated.promise
      },
      go: (url: string) => {
        handlers.get('navigate')?.({
          canIntercept: true,
          cancelable: true,
          navigationType: 'push',
          hashChange: false,
          downloadRequest: null,
          formData: null,
          preventDefault: () => undefined,
          destination: { url: new URL(url, 'https://example.test').href, key: 'k' },
          intercept: (intercepted: { handler: () => Promise<void> }) => intercepted.handler(),
        })
      },
    }
  }

  it('saves before going, so the edit is not lost on the way out', async () => {
    const driver = await editing({}, true)
    driver.view.dispatch({ changes: { from: 0, insert: 'edited ' } })

    driver.go('/doc/other.md')

    await driver.wentOn()

    expect(record.saved).toStrictEqual([{ id: 'notes.md', content: 'edited # notes.md' }])
  })

  it('asks nothing when the save lands', async () => {
    const driver = await editing({}, true)
    driver.view.dispatch({ changes: { from: 0, insert: 'edited ' } })

    driver.go('/doc/other.md')

    await driver.wentOn()

    expect(driver.asked).toStrictEqual([])
  })

  it('says what stopped the save, and that leaving discards the changes', async () => {
    const driver = await editing({ save: () => Promise.reject(new DocumentRequestError(412, 'Conflict')) }, false)
    driver.view.dispatch({ changes: { from: 0, insert: 'edited ' } })

    driver.go('/doc/other.md')

    await driver.answered()

    expect(driver.asked).toStrictEqual([
      'It changed on disk since it was loaded. Leaving now discards the changes you made.',
    ])
  })

  it('blocks an empty buffer, because the store refuses it', async () => {
    const driver = await editing({}, false)
    driver.view.dispatch({ changes: { from: 0, to: driver.view.state.doc.length, insert: '   ' } })

    driver.go('/doc/other.md')

    await driver.answered()

    expect(driver.asked).toStrictEqual(['Empty documents are not stored. Leaving now discards the changes you made.'])
  })

  it('does not ask the server to store an empty buffer', async () => {
    const driver = await editing({}, false)
    driver.view.dispatch({ changes: { from: 0, to: driver.view.state.doc.length, insert: '   ' } })

    driver.go('/doc/other.md')

    await driver.settled()

    expect(record.saved).toStrictEqual([])
  })

  it('discards the changes when the user says go, or the resumed navigation blocks again', async () => {
    const driver = await editing({ save: () => Promise.reject(new DocumentRequestError(412, 'Conflict')) }, true)
    driver.view.dispatch({ changes: { from: 0, insert: 'edited ' } })

    driver.go('/doc/other.md')

    await driver.settled()

    expect(root.querySelector('[data-part="save-label"]')?.textContent).toBe('')
  })

  it('stays on the document when the user declines', async () => {
    const driver = await editing({ save: () => Promise.reject(new DocumentRequestError(412, 'Conflict')) }, false)
    driver.view.dispatch({ changes: { from: 0, insert: 'edited ' } })

    driver.go('/doc/other.md')

    await driver.settled()

    expect(driver.view.state.doc.toString()).toBe('edited # notes.md')
  })
})

describe('a document with unsaved changes leaving a pane', () => {
  let stored = '# stored'

  async function editing(): Promise<{ view: EditorView; settled: () => Promise<void> }> {
    stored = '# stored'
    const started = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/notes.md',
        session: fakeSession({
          load: () => Promise.resolve({ content: stored, stored: true }),
          save: (_id: string, content: string) => {
            stored = content

            return Promise.resolve()
          },
        }),
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (started === null) throw new Error('the editor did not start')
    requestKeep(root, 'notes.md')
    started.view.dispatch({ changes: { from: started.view.state.doc.length, insert: ' and typed' } })

    return started
  }

  function editorsHolding(text: string): HTMLElement[] {
    return [...root.querySelectorAll<HTMLElement>('.cm-content')].filter((content) =>
      content.textContent.includes(text),
    )
  }

  function carryToTheOtherPane(): void {
    root.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, ctrlKey: true, shiftKey: true, bubbles: true }),
    )
  }

  it('is written before the pane it left is emptied', async () => {
    const started = await editing()

    carryToTheOtherPane()
    await started.settled()

    expect(stored).toBe('# stored and typed')
  })

  it('arrives in the other pane as the reader last had it, not as the store last had it', async () => {
    const started = await editing()

    carryToTheOtherPane()
    await started.settled()

    expect(editorsHolding('# stored and typed')).toHaveLength(ONE_EDITOR)
  })

  it('carries the work to the new pane even when the save failed, so nothing is stranded', async () => {
    const started = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/notes.md',
        session: fakeSession({
          load: () => Promise.resolve({ content: '# stored', stored: true }),
          save: () => Promise.reject(new Error('the store said no')),
        }),
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (started === null) throw new Error('the editor did not start')
    requestKeep(root, 'notes.md')
    started.view.dispatch({ changes: { from: started.view.state.doc.length, insert: ' and typed' } })

    carryToTheOtherPane()
    await started.settled()

    expect(editorsHolding('# stored and typed')).toHaveLength(ONE_EDITOR)
  })
})
