'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'

import { page, recorded, sessionRecording, type Recorded } from './editor-fixtures.ts'

const { bootstrap } = TestOnly

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

describe('a link inside the document', () => {
  it('opens on Ctrl+click, resolved against the document holding it', async () => {
    const opened: string[] = []
    const session = fakeSession({ load: () => Promise.resolve({ content: 'see [a](a.md)', stored: true }) })
    const view = await bootstrap({
      root,
      pathname: '/doc/journal/notes.md',
      session,
      openUrl: (url: string) => {
        opened.push(url)
      },
    })

    view.contentDOM
      .querySelector('.cm-vixen-link')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true }))

    expect(opened).toStrictEqual(['/doc/journal/a.md'])
  })
})
