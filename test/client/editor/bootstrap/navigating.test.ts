'use sanity'

import { given } from '../../../conditions.ts'
import { undoDepth } from '@codemirror/commands'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../../../../src/client/editor/session.ts'

import { cast } from '../../../cast.ts'

import { openEditor, page, recorded, sessionRecording, type Recorded } from '../../editor-fixtures.ts'

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

describe('the buffer when the workspace leaves a document', () => {
  it('forgets the previous text, so an unload cannot write it to the new path', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '# secrets', stored: false }) })

    const view = await openEditor({ root, pathname: '/doc/gone.md', session })

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
      removeEventListener: (type: string) => handlers.delete(type),
      canGoBack: false,
      canGoForward: false,
      back: () => undefined,
      forward: () => undefined,
    }),
  }
}

describe('navigating away from a document', () => {
  it('empties the buffer, so the previous text is not left behind', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({
      load: (id: string) =>
        Promise.resolve(id === 'gone.md' ? { content: '', stored: false } : { content: '# first', stored: true }),
    })
    const view = await openEditor({ root, pathname: '/doc/notes.md', session, navigation: stub.navigation })
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
    const view = await openEditor({ root, pathname: '/doc/notes.md', session, navigation: stub.navigation })
    view.dispatch({ changes: { from: 0, insert: 'unsaved ' } })
    given(() => {
      expect(root.querySelector('[data-part="save-label"]')?.textContent).toBe('Save pending')
    })

    await stub.go('/doc/gone.md')

    expect(root.querySelector('[data-part="save-label"]')?.textContent).toBe('')
  })

  it('loads the document it navigated to', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({
      load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
    })
    const view = await openEditor({ root, pathname: '/doc/notes.md', session, navigation: stub.navigation })

    await stub.go('/doc/other.md')

    expect(view.state.doc.toString()).toBe('# other.md')
  })

  it('titles the page with the document it navigated to', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({
      load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
    })
    await openEditor({ root, pathname: '/doc/notes.md', session, navigation: stub.navigation })

    await stub.go('/doc/other.md')

    expect(document.title).toBe('other.md')
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
        removeEventListener: (type: string) => handlers.delete(type),
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

    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    expect({ back: button('nav-back').disabled, forward: button('nav-forward').disabled }).toStrictEqual({
      back: true,
      forward: true,
    })
  })

  it('become usable once the browser says there is history to walk', async () => {
    const { navigation } = stubbedNavigation(true, true)

    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    expect({ back: button('nav-back').disabled, forward: button('nav-forward').disabled }).toStrictEqual({
      back: false,
      forward: false,
    })
  })

  it('keep aria-disabled in step with disabled, for anyone not using a mouse', async () => {
    const { navigation } = stubbedNavigation(true, false)

    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    expect({
      back: button('nav-back').getAttribute('aria-disabled'),
      forward: button('nav-forward').getAttribute('aria-disabled'),
    }).toStrictEqual({ back: 'false', forward: 'true' })
  })

  it('walk the history through the Navigation API rather than through history.back', async () => {
    const { navigation, went } = stubbedNavigation(true, true)
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    button('nav-back').click()
    button('nav-forward').click()

    expect(went).toStrictEqual(['back', 'forward'])
  })

  it('are refreshed once a navigation settles, which is when the answer changes', async () => {
    const stub = stubbedNavigation(false, false)
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation: stub.navigation })
    given(() => {
      expect(button('nav-back').disabled).toBe(true)
    })

    stub.allow(true, false)
    stub.settle()

    expect(button('nav-back').disabled).toBe(false)
  })

  it('do nothing when there is nowhere to go, rather than throwing', async () => {
    const { navigation, went } = stubbedNavigation(false, false)
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession(), navigation })

    button('nav-back').click()
    button('nav-forward').click()

    expect(went).toStrictEqual([])
  })
})

describe('navigating to a URL that names a view', () => {
  function sourceBody(): HTMLElement | null {
    return root.querySelectorAll<HTMLElement>('[data-part="source-body"]')[1] ?? null
  }

  it('opens the view the destination names, not the one the page started on', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({ load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }) })
    await openEditor({ root, pathname: '/doc/a.md', session, navigation: stub.navigation })

    await stub.go('/doc/b.md?view=source')

    expect(sourceBody()?.textContent).toBe('# b.md')
  })
})
