'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { LoadedDocument, Session } from '../../src/client/editor/session.ts'

import { page, recorded, sessionRecording, type Recorded } from './editor-fixtures.ts'

const { bootstrap } = TestOnly

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()
let wake: () => void = () => undefined

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

async function editing(reread: () => Promise<LoadedDocument | null>): Promise<ReturnType<typeof bootstrap>> {
  return await bootstrap({
    root,
    pathname: '/doc/notes.md',
    session: fakeSession({ load: () => Promise.resolve({ content: '# stored', stored: true }), reread }),
    listenForFocus: (registered) => {
      wake = registered

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
})

describe('a clean buffer when the document changes on disk', () => {
  it('reloads, so the editor shows what is actually stored', async () => {
    const view = await editing(() => Promise.resolve({ content: '# changed elsewhere', stored: true }))

    wake()

    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe('# changed elsewhere')
    })
  })

  it('says it reloaded, rather than the text changing silently', async () => {
    await editing(() => Promise.resolve({ content: '# changed elsewhere', stored: true }))

    wake()

    await vi.waitFor(() => {
      expect(statusText()).toContain('changed on disk — reloaded')
    })
  })

  it('keeps the caret where it was, so the reader does not lose their place', async () => {
    const view = await editing(() => Promise.resolve({ content: '# changed elsewhere', stored: true }))
    view.dispatch({ selection: { anchor: 4 } })

    wake()

    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe('# changed elsewhere')
    })
    expect(view.state.selection.main.head).toBe(4)
  })

  it('clamps the caret when the document shrank underneath it', async () => {
    const view = await editing(() => Promise.resolve({ content: 'x', stored: true }))
    view.dispatch({ selection: { anchor: 6 } })

    wake()

    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe('x')
    })
    expect(view.state.selection.main.head).toBe(1)
  })

  it('leaves the buffer alone when nothing changed', async () => {
    const view = await editing(() => Promise.resolve(null))

    wake()
    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe('# stored')
    })

    expect(statusText()).not.toContain('reloaded')
  })
})

describe('a dirty buffer when the document changes on disk', () => {
  it('is never replaced, because that would discard unsaved work', async () => {
    const view = await editing(() => Promise.resolve({ content: '# changed elsewhere', stored: true }))
    view.dispatch({ changes: { from: 0, insert: 'mine ' } })

    wake()

    await vi.waitFor(() => {
      expect(statusText()).toContain('can no longer be saved')
    })
    expect(view.state.doc.toString()).toBe('mine # stored')
  })
})

describe('a check that cannot be made', () => {
  it('says nothing when the server cannot be reached', async () => {
    await editing(() => Promise.reject(new Error('network down')))

    wake()

    await vi.waitFor(() => {
      expect(statusText()).not.toContain('reloaded')
    })
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
      listenForFocus: (registered) => {
        wake = registered

        return () => undefined
      },
    })

    wake()
    await vi.waitFor(() => {
      expect(root.querySelector<HTMLElement>('#view-missing')?.hidden).toBe(false)
    })

    expect(asked).toStrictEqual([])
  })
})

describe('a check while a save is in flight', () => {
  it('is skipped, or it could observe a half-written document', async () => {
    const asked: string[] = []
    const hanging: PromiseWithResolvers<void> = Promise.withResolvers()
    const view = await bootstrap({
      root,
      pathname: '/doc/notes.md',
      session: fakeSession({
        load: () => Promise.resolve({ content: '# stored', stored: true }),
        save: () => hanging.promise,
        reread: (id: string) => {
          asked.push(id)

          return Promise.resolve(null)
        },
      }),
      listenForFocus: (registered) => {
        wake = registered

        return () => undefined
      },
    })

    view.dispatch({ changes: { from: 0, insert: 'mine ' } })
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }),
    )
    await vi.waitFor(() => {
      expect(root.querySelector('#save-label')?.textContent).toBe('Saving…')
    })

    wake()
    await vi.waitFor(() => {
      expect(root.querySelector('#save-label')?.textContent).toBe('Saving…')
    })

    expect(asked).toStrictEqual([])
    hanging.resolve()
  })
})
