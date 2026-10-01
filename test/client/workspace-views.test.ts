'use sanity'

import { given } from '../conditions.ts'
import { undoDepth } from '@codemirror/commands'
import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport, TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'

import { cast } from '../cast.ts'
import type { EditorView } from '@codemirror/view'
import type { Dialogs } from '../../src/client/files/dialogs.ts'
import { DocumentRequestError } from '../../src/client/editor/document-client.ts'
import type { FilesClient } from '../../src/client/files/files-client.ts'

import { openEditor, page, recorded, sessionRecording, statusText, type Recorded } from './editor-fixtures.ts'

const { bootstrap } = TestOnly

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

const NOW = '2026-09-01T10:00:00.000Z'

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('which view the workspace shows', () => {
  function shown(): string[] {
    return [...root.querySelectorAll<HTMLElement>('#editor, [id^="view-"]')]
      .filter((view) => view.hidden === false)
      .map((view) => view.id)
  }

  it('shows the editor once the document has loaded', async () => {
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(shown()).toStrictEqual(['editor'])
  })

  it('reports a named document that is not there, rather than offering a blank one', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: false }) })

    await bootstrap({ root, pathname: '/doc/journal/gone.md', session })

    expect(shown()).toStrictEqual(['view-missing'])
  })

  it('names the path that is missing', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: false }) })

    await bootstrap({ root, pathname: '/doc/journal/gone.md', session })

    expect(root.querySelector('#missing-path')?.textContent).toBe('journal/gone.md')
  })

  it('opens a missing folder index as a new document, because browsing must not write', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '# new', stored: false }) })

    await openEditor({ root, pathname: '/doc/journal/', session })

    expect(shown()).toStrictEqual(['editor'])
  })

  it('leaves the buffer empty, so nothing can autosave into a document that is not there', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '# template', stored: false }) })

    const view = await bootstrap({ root, pathname: '/doc/journal/gone.md', session })

    expect(view.state.doc.toString()).toBe('')
  })

  it('shows the unreachable view when the load fails outright', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrap({ root, pathname: '/doc/notes.md', session })

    expect(shown()).toStrictEqual(['view-unreachable'])
  })

  it('says why it could not be reached, so a reload is an informed choice', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrap({ root, pathname: '/doc/notes.md', session })

    expect(root.querySelector('#unreachable-reason')?.textContent).toContain('network down')
  })

  it('names the store rather than an empty path when the root cannot be loaded', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrap({ root, pathname: '/doc/', session })

    expect(root.querySelector('#unreachable-reason')?.textContent).toContain('The store')
  })

  it('survives markup with nowhere to write the reason', async () => {
    root.querySelector('#unreachable-reason')?.remove()
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await expect(bootstrap({ root, pathname: '/doc/notes.md', session })).resolves.toBeDefined()
  })

  it('does not report an unreachable store as a failure to start', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrapOrReport({ root, pathname: '/doc/notes.md', session })

    expect(statusText(root)).not.toContain('Failed to start')
  })
})

describe('the page title', () => {
  it('names the open document', async () => {
    await openEditor({ root, pathname: '/doc/journal/a.md', session: fakeSession() })

    expect(document.title).toBe('journal/a.md')
  })

  it('names a folder by its own name, not by its index file', async () => {
    await openEditor({ root, pathname: '/doc/journal/2026/', session: fakeSession() })

    expect(document.title).toBe('journal/2026')
  })
})

describe('long lines', () => {
  it('are marked for wrapping rather than left to scroll sideways', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
  })
})

async function afterTheViewChanges(watched: HTMLElement): Promise<void> {
  const changed: PromiseWithResolvers<void> = Promise.withResolvers()
  const observer = new MutationObserver(() => {
    observer.disconnect()
    changed.resolve()
  })
  observer.observe(watched, { attributes: true, subtree: true })

  await changed.promise
}

describe('a trash entry url', () => {
  function shown(): string[] {
    return [...root.querySelectorAll<HTMLElement>('#editor, [id^="view-"]')]
      .filter((element) => element.hidden === false)
      .map((element) => element.id)
  }

  it('shows the deleted view rather than trying to load a document', async () => {
    const trash = [{ id: 'entry-1', originalPath: 'journal/a.md', kind: 'document' as const, deletedAt: NOW }]
    const files = cast<FilesClient>({ trash: () => Promise.resolve(trash), tree: () => Promise.resolve([]) })

    await bootstrap({ root, pathname: '/trash/entry-1', session: fakeSession(), files })
    await afterTheViewChanges(root)

    expect(shown()).toStrictEqual(['view-deleted'])
  })

  it('asks the session for nothing, because a trash entry is not a document', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve({ content: '', stored: true })
      },
    })
    const files = cast<FilesClient>({ trash: () => Promise.resolve([]), tree: () => Promise.resolve([]) })

    await bootstrap({ root, pathname: '/trash/entry-1', session, files })

    expect(loaded).toStrictEqual([])
  })

  it('leaves the buffer empty, so nothing can autosave into a deleted entry', async () => {
    const files = cast<FilesClient>({ trash: () => Promise.resolve([]), tree: () => Promise.resolve([]) })

    const view = await bootstrap({ root, pathname: '/trash/entry-1', session: fakeSession(), files })

    expect(view.state.doc.toString()).toBe('')
  })
})

describe('an image path', () => {
  function shown(): string[] {
    return [...root.querySelectorAll<HTMLElement>('#editor, [id^="view-"]')]
      .filter((element) => element.hidden === false)
      .map((element) => element.id)
  }

  it('is never asked of the documents api, which refuses it with a 400 rather than a 404', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve({ content: '', stored: true })
      },
    })

    await bootstrap({ root, pathname: '/doc/journal/photo.png', session })

    expect(loaded).toStrictEqual([])
  })

  it('leaves the buffer empty, because an image is not a buffer', async () => {
    const view = await bootstrap({ root, pathname: '/doc/photo.png', session: fakeSession() })

    expect(view.state.doc.toString()).toBe('')
  })

  it('shows the image once it has loaded', async () => {
    await bootstrap({ root, pathname: '/doc/journal/photo.png', session: fakeSession() })

    root.querySelector('#image-file')?.dispatchEvent(new Event('load'))

    expect(shown()).toStrictEqual(['view-image'])
  })

  it('falls through to the missing view when the image will not load', async () => {
    await bootstrap({ root, pathname: '/doc/journal/gone.png', session: fakeSession() })

    root.querySelector('#image-file')?.dispatchEvent(new Event('error'))

    expect(shown()).toStrictEqual(['view-missing'])
  })

  it('names the broken image as the missing path', async () => {
    await bootstrap({ root, pathname: '/doc/journal/gone.png', session: fakeSession() })

    root.querySelector('#image-file')?.dispatchEvent(new Event('error'))

    expect(root.querySelector('#missing-path')?.textContent).toBe('journal/gone.png')
  })
})

describe('the buffer when the workspace leaves a document', () => {
  it('forgets the previous text, so an unload cannot write it to the new path', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '# secrets', stored: false }) })

    const view = await bootstrap({ root, pathname: '/doc/gone.md', session })

    expect(view.state.doc.toString()).toBe('')
  })

  it('has no undo history to reach back into', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })
    view.dispatch({ changes: { from: 0, insert: 'typed ' } })

    const fresh = await openEditor({ root, pathname: '/doc/other.md', session: fakeSession() })

    expect(undoDepth(fresh.state)).toBe(0)
  })

  it('keeps an undo step made since the document opened', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    view.dispatch({ changes: { from: 0, insert: 'typed ' } })

    expect(undoDepth(view.state)).toBeGreaterThan(0)
  })
})

describe('navigating away from a document', () => {
  function stubbedNavigation(): { navigation: Navigation; go: (url: string) => Promise<void> } {
    const handlers = new Map<string, (event?: unknown) => void>()

    return {
      go: async (url: string) => {
        let navigated: Promise<void> = Promise.resolve()

        handlers.get('navigate')?.({
          canIntercept: true,
          hashChange: false,
          downloadRequest: null,
          formData: null,
          destination: { url: new URL(url, 'https://example.test').href },
          intercept: (intercepted: { handler: () => Promise<void> }) => {
            navigated = intercepted.handler()
          },
        })

        await navigated
      },
      navigation: cast<Navigation>({
        addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
        canGoBack: false,
        canGoForward: false,
        back: () => undefined,
        forward: () => undefined,
      }),
    }
  }

  it('empties the buffer, so the previous text is not left behind', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({
      load: (id: string) =>
        Promise.resolve(id === 'gone.md' ? { content: '', stored: false } : { content: '# first', stored: true }),
    })
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session, navigation: stub.navigation })
    given(() => {
      expect(view.state.doc.toString()).toBe('# first')
    })

    await stub.go('/doc/gone.md')

    expect(view.state.doc.toString()).toBe('')
  })

  it('stops counting down to a save, so the edit cannot land on the path it arrived at', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({
      load: (id: string) =>
        Promise.resolve(id === 'gone.md' ? { content: '', stored: false } : { content: '# first', stored: true }),
    })
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session, navigation: stub.navigation })
    view.dispatch({ changes: { from: 0, insert: 'unsaved ' } })
    given(() => {
      expect(root.querySelector('#save-label')?.textContent).toBe('Save pending')
    })

    await stub.go('/doc/gone.md')

    expect(root.querySelector('#save-label')?.textContent).toBe('')
  })

  it('loads the document it navigated to', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({
      load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
    })
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session, navigation: stub.navigation })

    await stub.go('/doc/other.md')

    expect(view.state.doc.toString()).toBe('# other.md')
  })

  it('titles the page with the document it navigated to', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({
      load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
    })
    await bootstrap({ root, pathname: '/doc/notes.md', session, navigation: stub.navigation })

    await stub.go('/doc/other.md')

    expect(document.title).toBe('other.md')
  })
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

    const view = await bootstrap({
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

    expect(root.querySelector('#save-label')?.textContent).toBe('')
  })

  it('stays on the document when the user declines', async () => {
    const driver = await editing({ save: () => Promise.reject(new DocumentRequestError(412, 'Conflict')) }, false)
    driver.view.dispatch({ changes: { from: 0, insert: 'edited ' } })

    driver.go('/doc/other.md')

    await driver.settled()

    expect(driver.view.state.doc.toString()).toBe('edited # notes.md')
  })
})

describe('the ribbon history buttons', () => {
  function button(id: string): HTMLButtonElement {
    const element = root.querySelector<HTMLButtonElement>(`#${id}`)
    if (element === null) throw new Error(`no ${id} button`)

    return element
  }

  interface Stubbed {
    navigation: Navigation
    went: string[]
    settle: () => void
    go: (url: string) => void
    allow: (canGoBack: boolean, canGoForward: boolean) => void
  }

  function stubbedNavigation(canGoBack: boolean, canGoForward: boolean): Stubbed {
    const went: string[] = []
    const handlers = new Map<string, (event?: unknown) => void>()
    const state = { canGoBack, canGoForward }

    return {
      went,
      settle: () => handlers.get('navigatesuccess')?.(),
      go: (url: string) => {
        handlers.get('navigate')?.({
          canIntercept: true,
          hashChange: false,
          downloadRequest: null,
          formData: null,
          destination: { url: new URL(url, 'https://example.test').href },
          intercept: (intercepted: { handler: () => Promise<void> }) => intercepted.handler(),
        })
      },
      allow: (back: boolean, forward: boolean) => {
        state.canGoBack = back
        state.canGoForward = forward
      },
      navigation: cast<Navigation>({
        addEventListener: (type: string, handler: (event: unknown) => void) => handlers.set(type, handler),
        get canGoBack() {
          return state.canGoBack
        },
        get canGoForward() {
          return state.canGoForward
        },
        back: () => went.push('back'),
        forward: () => went.push('forward'),
      }),
    }
  }

  it('stay disabled while there is nowhere to go', async () => {
    const { navigation } = stubbedNavigation(false, false)

    await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    expect({ back: button('nav-back').disabled, forward: button('nav-forward').disabled }).toStrictEqual({
      back: true,
      forward: true,
    })
  })

  it('become usable once the browser says there is history to walk', async () => {
    const { navigation } = stubbedNavigation(true, true)

    await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    expect({ back: button('nav-back').disabled, forward: button('nav-forward').disabled }).toStrictEqual({
      back: false,
      forward: false,
    })
  })

  it('keep aria-disabled in step with disabled, for anyone not using a mouse', async () => {
    const { navigation } = stubbedNavigation(true, false)

    await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    expect({
      back: button('nav-back').getAttribute('aria-disabled'),
      forward: button('nav-forward').getAttribute('aria-disabled'),
    }).toStrictEqual({ back: 'false', forward: 'true' })
  })

  it('walk the history through the Navigation API rather than through history.back', async () => {
    const { navigation, went } = stubbedNavigation(true, true)
    await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    button('nav-back').click()
    button('nav-forward').click()

    expect(went).toStrictEqual(['back', 'forward'])
  })

  it('are refreshed once a navigation settles, which is when the answer changes', async () => {
    const stub = stubbedNavigation(false, false)
    await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation: stub.navigation })
    given(() => {
      expect(button('nav-back').disabled).toBe(true)
    })

    stub.allow(true, false)
    stub.settle()

    expect(button('nav-back').disabled).toBe(false)
  })

  it('do nothing when there is nowhere to go, rather than throwing', async () => {
    const { navigation, went } = stubbedNavigation(false, false)
    await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    button('nav-back').click()
    button('nav-forward').click()

    expect(went).toStrictEqual([])
  })
})
