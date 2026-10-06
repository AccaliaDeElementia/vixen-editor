'use sanity'

import { given } from '../../../conditions.ts'
import { undoDepth } from '@codemirror/commands'
import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../../../../src/client/editor/session.ts'

import { cast } from '../../../cast.ts'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
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
import { requestOpenAside } from '../../../../src/client/open-aside.ts'

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

describe('opening a document the other pane already holds', () => {
  function press(init: KeyboardEventInit): void {
    root.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
  }

  function stripOf(which: number): HTMLElement | undefined {
    return root.querySelectorAll<HTMLElement>('[data-part="tabs"]')[which]
  }

  it('takes it out of that pane, because only one editor may hold a document', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({ load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }) })
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/a.md',
        session,
        navigation: stub.navigation,
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (editor === null) throw new Error('the editor did not start')
    root.querySelector<HTMLElement>('#preview-markup')?.click()
    press({ key: 'ArrowLeft', altKey: true, ctrlKey: true })
    press({ key: 'ArrowRight', altKey: true, ctrlKey: true, shiftKey: true })
    await editor.settled()
    given(() => {
      expect(stripOf(1)?.querySelector('[data-tab="editor:a.md"]')).not.toBeNull()
    })
    press({ key: 'ArrowLeft', altKey: true, ctrlKey: true })

    await stub.go('/doc/a.md')

    expect(root.querySelectorAll('[data-tab="editor:a.md"]')).toHaveLength(1)
  })
})

describe('which pane a plain open targets', () => {
  it('opens into the pane the reader last used, not always the first', async () => {
    const stub = stubbedNavigation()
    const session = fakeSession({ load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }) })
    await openEditor({ root, pathname: '/doc/a.md', session, navigation: stub.navigation })
    root.querySelector<HTMLElement>('#preview-markup')?.click()
    given(() => {
      expect(root.querySelectorAll<HTMLElement>('[data-part="pane"]')[1]?.dataset.infront).not.toBe('false')
    })

    await stub.go('/doc/b.md')

    expect(
      root.querySelectorAll<HTMLElement>('[data-part="tabs"]')[1]?.querySelector('[data-tab="editor:b.md"]'),
    ).not.toBeNull()
  })
})

describe('opening a document beside what is already open', () => {
  it('puts it in the other pane, so what the reader was reading stays put', async () => {
    const session = fakeSession({ load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }) })
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/a.md',
        session,
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (editor === null) throw new Error('the editor did not start')

    requestOpenAside(root, 'b.md')
    await editor.settled()

    expect(
      root.querySelectorAll<HTMLElement>('[data-part="tabs"]')[1]?.querySelector('[data-tab="editor:b.md"]'),
    ).not.toBeNull()
  })

  it('leaves the first pane showing what it had', async () => {
    const session = fakeSession({ load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }) })
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/a.md',
        session,
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (editor === null) throw new Error('the editor did not start')

    requestOpenAside(root, 'b.md')
    await editor.settled()

    expect(
      root.querySelectorAll<HTMLElement>('[data-part="tabs"]')[0]?.querySelector('[data-tab="editor:a.md"]'),
    ).not.toBeNull()
  })

  it('opens into the first pane when the reader was already in the second', async () => {
    const session = fakeSession({ load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }) })
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/a.md',
        session,
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (editor === null) throw new Error('the editor did not start')
    root.querySelector<HTMLElement>('#preview-markup')?.click()

    requestOpenAside(root, 'b.md')
    await editor.settled()

    expect(
      root.querySelectorAll<HTMLElement>('[data-part="tabs"]')[0]?.querySelector('[data-tab="editor:b.md"]'),
    ).not.toBeNull()
  })

  it('is left alone on a page with nowhere to put a second pane', async () => {
    const session = fakeSession({ load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }) })
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/a.md',
        session,
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (editor === null) throw new Error('the editor did not start')
    root.querySelector('[data-part="panes"]')?.remove()

    requestOpenAside(root, 'b.md')
    await editor.settled()

    expect(root.querySelector('[data-part="panes"]')).toBeNull()
  })
})
