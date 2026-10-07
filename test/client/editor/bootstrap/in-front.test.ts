'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'
import { cast } from '../../../cast.ts'
import { page, recorded, sessionRecording, trackEditor, type Recorded } from '../../editor-fixtures.ts'
import { dialogsDismissing, filesAnsweringEmpty } from '../../editor-fixtures.ts'
import { givenAsync } from '../../../conditions.ts'
import { requestOpenAside } from '../../../../src/client/open-aside.ts'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(): Session {
  return sessionRecording(record, {
    load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: true }),
  })
}

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

function tabsIn(pane: number): Array<string | undefined> {
  const { [pane]: strip } = root.querySelectorAll<HTMLElement>('[data-part="tabs"]')

  return [...(strip?.querySelectorAll<HTMLElement>('[role="tab"]') ?? [])].map((tab) => tab.dataset.tab)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('opening a document after a preview was shown', () => {
  it('lands in the pane the reader was working in, because a ribbon button is not a pane they focused', async () => {
    const stub = stubbedNavigation()
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/notes.md',
        session: fakeSession(),
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
        navigation: stub.navigation,
      }),
    )
    if (editor === null) throw new Error('the editor did not start')
    root.querySelector<HTMLElement>('#preview-markup')?.click()

    await givenAsync(stub.go('/doc/other.md'))

    expect(tabsIn(0)).toStrictEqual(['editor:other.md'])
  })
})

describe('closing the tab in front after the reader moved to the second pane', () => {
  it("closes that pane's tab, not the one in the pane they came from", async () => {
    const editor = trackEditor(
      await bootstrapOrReport({
        root,
        pathname: '/doc/notes.md',
        session: fakeSession(),
        files: filesAnsweringEmpty(),
        dialogs: dialogsDismissing(),
      }),
    )
    if (editor === null) throw new Error('the editor did not start')
    requestOpenAside(root, 'other.md')
    await givenAsync(editor.settled())

    root.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key: 'w', altKey: true }))

    expect(tabsIn(0)).toStrictEqual(['editor:notes.md'])
  })
})
