'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { announceDocumentMoved } from '../../../../src/client/document-moved.ts'
import { requestKeep } from '../../../../src/client/keep-request.ts'
import { readKeptTabs, writeKeptTabs } from '../../../../src/client/layout/kept-tabs.ts'
import type { Session } from '../../../../src/client/editor/session.ts'

import { openEditor, page, recorded, sessionRecording, type Recorded } from '../../editor-fixtures.ts'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()
let loaded: string[] = []

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, {
    load: (id: string) => {
      loaded.push(id)

      return Promise.resolve({ content: `# ${id}`, stored: true })
    },
    ...overrides,
  })
}

function stripTabs(): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>('#tab-strip [role="tab"]')]
}

function paths(): Array<string | undefined> {
  return stripTabs().map((tab) => tab.dataset.path)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  loaded = []
  document.body.innerHTML = ''
  root = page()
})

describe('the tabs a reload brings back', () => {
  it('shows one for every document kept before the page went away', async () => {
    writeKeptTabs([{ path: 'kept.md', view: 'editor' }])

    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })

    expect(paths()).toStrictEqual(['kept.md', 'a.md'])
  })

  it('does not mark a restored tab as one the reader is only looking at', async () => {
    writeKeptTabs([{ path: 'kept.md', view: 'editor' }])

    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })

    expect(stripTabs().at(0)?.classList.contains('tabs__tab--looking')).toBe(false)
  })

  it('restores the strip without reading the documents, so a reload costs one request', async () => {
    writeKeptTabs([{ path: 'kept.md', view: 'editor' }])

    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })

    expect(loaded).toStrictEqual(['a.md'])
  })

  it('still marks the document being shown as the active one', async () => {
    writeKeptTabs([{ path: 'kept.md', view: 'editor' }])

    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })

    expect(
      stripTabs()
        .filter((tab) => tab.getAttribute('aria-selected') === 'true')
        .map((tab) => tab.dataset.path),
    ).toStrictEqual(['a.md'])
  })

  it('raises a restored tab rather than showing the same document twice', async () => {
    writeKeptTabs([{ path: 'a.md', view: 'editor' }])

    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })

    expect(paths()).toStrictEqual(['a.md'])
  })
})

describe('what a reload is told to bring back', () => {
  it('records a tab once the reader keeps it', async () => {
    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })

    requestKeep(root, 'a.md')

    expect(readKeptTabs()).toStrictEqual([{ path: 'a.md', view: 'editor' }])
  })

  it('records nothing for a tab the reader is only looking at', async () => {
    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })

    expect(readKeptTabs()).toStrictEqual([])
  })

  it('records where a kept tab moved to, so a rename does not orphan it', async () => {
    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })
    requestKeep(root, 'a.md')

    announceDocumentMoved(root, { from: 'a.md', to: 'archive/a.md', rewritten: [] })

    expect(readKeptTabs()).toStrictEqual([{ path: 'archive/a.md', view: 'editor' }])
  })

  it('moves a kept tab that is not the one being shown', async () => {
    writeKeptTabs([{ path: 'kept.md', view: 'editor' }])
    await openEditor({ root, pathname: '/doc/a.md', session: fakeSession() })

    announceDocumentMoved(root, { from: 'kept.md', to: 'archive/kept.md', rewritten: [] })

    expect(readKeptTabs()).toStrictEqual([{ path: 'archive/kept.md', view: 'editor' }])
  })
})
