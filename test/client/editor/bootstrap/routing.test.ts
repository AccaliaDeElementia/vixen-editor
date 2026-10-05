'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'

import { cast } from '../../../cast.ts'
import type { FilesClient } from '../../../../src/client/files/files-client.ts'

import {
  openEditor,
  page,
  recorded,
  sessionRecording,
  statusText,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

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
    return [...root.querySelectorAll<HTMLElement>('[data-part="editor"], [data-part^="view-"]')]
      .filter((view) => view.hidden === false)
      .flatMap((view) => view.dataset.part ?? [])
  }

  it('shows the editor once the document has loaded', async () => {
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(shown()).toStrictEqual(['editor'])
  })

  it('reports a named document that is not there, rather than offering a blank one', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: false }) })

    await openEditor({ root, pathname: '/doc/journal/gone.md', session })

    expect(shown()).toStrictEqual(['view-missing'])
  })

  it('names the path that is missing', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: false }) })

    await openEditor({ root, pathname: '/doc/journal/gone.md', session })

    expect(root.querySelector('[data-part="missing-path"]')?.textContent).toBe('journal/gone.md')
  })

  it('opens a missing folder index as a new document, because browsing must not write', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '# new', stored: false }) })

    await openEditor({ root, pathname: '/doc/journal/', session })

    expect(shown()).toStrictEqual(['editor'])
  })

  it('leaves the buffer empty, so nothing can autosave into a document that is not there', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '# template', stored: false }) })

    const view = await openEditor({ root, pathname: '/doc/journal/gone.md', session })

    expect(view.state.doc.toString()).toBe('')
  })

  it('shows the unreachable view when the load fails outright', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await openEditor({ root, pathname: '/doc/notes.md', session })

    expect(shown()).toStrictEqual(['view-unreachable'])
  })

  it('says why it could not be reached, so a reload is an informed choice', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await openEditor({ root, pathname: '/doc/notes.md', session })

    expect(root.querySelector('[data-part="unreachable-reason"]')?.textContent).toContain('network down')
  })

  it('names the store rather than an empty path when the root cannot be loaded', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await openEditor({ root, pathname: '/doc/', session })

    expect(root.querySelector('[data-part="unreachable-reason"]')?.textContent).toContain('The store')
  })

  it('survives markup with nowhere to write the reason', async () => {
    root.querySelector('[data-part="unreachable-reason"]')?.remove()
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await expect(openEditor({ root, pathname: '/doc/notes.md', session })).resolves.toBeDefined()
  })

  it('does not report an unreachable store as a failure to start', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    trackEditor(await bootstrapOrReport({ root, pathname: '/doc/notes.md', session }))

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

describe('a trash entry url', () => {
  function shown(): string[] {
    return [...root.querySelectorAll<HTMLElement>('[data-part="editor"], [data-part^="view-"]')]
      .filter((element) => element.hidden === false)
      .flatMap((element) => element.dataset.part ?? [])
  }

  it('shows the deleted view rather than trying to load a document', async () => {
    const trash = [{ id: 'entry-1', originalPath: 'journal/a.md', kind: 'document' as const, deletedAt: NOW }]
    const files = cast<FilesClient>({
      trash: () => Promise.resolve(trash),
      tree: () => Promise.resolve([]),
      trashEntry: () => Promise.resolve(null),
    })

    await openEditor({ root, pathname: '/trash/entry-1', session: fakeSession(), files })

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

    await openEditor({ root, pathname: '/trash/entry-1', session, files })

    expect(loaded).toStrictEqual([])
  })

  it('leaves the buffer empty, so nothing can autosave into a deleted entry', async () => {
    const files = cast<FilesClient>({ trash: () => Promise.resolve([]), tree: () => Promise.resolve([]) })

    const view = await openEditor({ root, pathname: '/trash/entry-1', session: fakeSession(), files })

    expect(view.state.doc.toString()).toBe('')
  })
})

describe('an image path', () => {
  function shown(): string[] {
    return [...root.querySelectorAll<HTMLElement>('[data-part="editor"], [data-part^="view-"]')]
      .filter((element) => element.hidden === false)
      .flatMap((element) => element.dataset.part ?? [])
  }

  it('is never asked of the documents api, which refuses it with a 400 rather than a 404', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve({ content: '', stored: true })
      },
    })

    await openEditor({ root, pathname: '/doc/journal/photo.png', session })

    expect(loaded).toStrictEqual([])
  })

  it('leaves the buffer empty, because an image is not a buffer', async () => {
    const view = await openEditor({ root, pathname: '/doc/photo.png', session: fakeSession() })

    expect(view.state.doc.toString()).toBe('')
  })

  it('shows the image once it has loaded', async () => {
    await openEditor({ root, pathname: '/doc/journal/photo.png', session: fakeSession() })

    root.querySelector('[data-part="image-file"]')?.dispatchEvent(new Event('load'))

    expect(shown()).toStrictEqual(['view-image'])
  })

  it('falls through to the missing view when the image will not load', async () => {
    await openEditor({ root, pathname: '/doc/journal/gone.png', session: fakeSession() })

    root.querySelector('[data-part="image-file"]')?.dispatchEvent(new Event('error'))

    expect(shown()).toStrictEqual(['view-missing'])
  })

  it('names the broken image as the missing path', async () => {
    await openEditor({ root, pathname: '/doc/journal/gone.png', session: fakeSession() })

    root.querySelector('[data-part="image-file"]')?.dispatchEvent(new Event('error'))

    expect(root.querySelector('[data-part="missing-path"]')?.textContent).toBe('journal/gone.png')
  })
})
