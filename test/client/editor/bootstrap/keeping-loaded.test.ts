'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'
import { undo } from '@codemirror/commands'
import type { EditorView } from '@codemirror/view'

import type { Session } from '../../../../src/client/editor/session.ts'
import { cast } from '../../../cast.ts'

import { openEditor, page, recorded, sessionRecording, type Recorded } from '../../editor-fixtures.ts'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()
let stored = new Map<string, string>()

function storingSession(): Session {
  return sessionRecording(record, {
    load: (id: string) => Promise.resolve({ content: stored.get(id) ?? `# ${id}`, stored: true }),
    save: (id: string, content: string) => {
      stored.set(id, content)

      return Promise.resolve()
    },
  })
}

function walking(): { navigation: Navigation; go: (url: string) => Promise<void> } {
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

async function typedInAndCameBack(): Promise<EditorView> {
  const walk = walking()
  const view = await openEditor({ root, pathname: '/doc/a.md', session: storingSession(), navigation: walk.navigation })
  view.dispatch({ changes: { from: view.state.doc.length, insert: ' typed' } })
  stored.set('a.md', view.state.doc.toString())

  await walk.go('/doc/b.md')
  await walk.go('/doc/a.md')

  return view
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  stored = new Map()
  document.body.innerHTML = ''
  root = page()
})

describe('coming back to a document that is still loaded', () => {
  it('shows what the store holds', async () => {
    const view = await typedInAndCameBack()

    expect(view.state.doc.toString()).toBe('# a.md typed')
  })

  it('still has the work that got it there, so undo reaches back past the switch', async () => {
    const view = await typedInAndCameBack()

    undo(view)

    expect(view.state.doc.toString()).toBe('# a.md')
  })
})

describe('coming back to a document the store has changed underneath', () => {
  it('shows what the store holds rather than what was loaded before', async () => {
    const walk = walking()
    const view = await openEditor({
      root,
      pathname: '/doc/a.md',
      session: storingSession(),
      navigation: walk.navigation,
    })
    await walk.go('/doc/b.md')
    stored.set('a.md', '# changed elsewhere')

    await walk.go('/doc/a.md')

    expect(view.state.doc.toString()).toBe('# changed elsewhere')
  })
})
