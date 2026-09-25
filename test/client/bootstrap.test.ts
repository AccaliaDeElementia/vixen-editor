'use sanity'

import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { announceDocumentMoved } from '../../src/client/document-moved.ts'
import { bootstrapOrReport, TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'

const { MissingMountError, bootstrap } = TestOnly

let root: HTMLElement = document.createElement('div')
let saved: Array<{ id: string; content: string }> = []
let renamed: Array<{ from: string; to: string }> = []

function page({ withMount = true, withStatus = true } = {}): HTMLElement {
  const container = document.createElement('div')
  if (withStatus) {
    const status = document.createElement('span')
    status.id = 'status'
    container.append(status)
  }
  if (withMount) {
    const mount = document.createElement('div')
    mount.id = 'editor'
    container.append(mount)
  }
  document.body.append(container)
  return container
}

function fakeSession(overrides: Partial<Session> = {}): Session {
  return {
    load: (id: string) => Promise.resolve(`# ${id}`),
    save: (id: string, content: string) => {
      saved.push({ id, content })
      return Promise.resolve()
    },
    rename: (from: string, to: string) => {
      renamed.push({ from, to })
    },
    ...overrides,
  }
}

function statusText(container: ParentNode): string {
  return container.querySelector('#status')?.textContent ?? ''
}

beforeEach(() => {
  saved = []
  renamed = []
  document.body.innerHTML = ''
  root = page()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('bootstrap', () => {
  it('mounts an editor into the configured selector', async () => {
    await bootstrap({ root, pathname: '/doc/', session: fakeSession() })

    expect(root.querySelector('#editor .cm-editor')).not.toBeNull()
  })

  it('seeds the editor with the loaded document', async () => {
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(view.state.doc.toString()).toBe('# notes.md')
  })

  it('loads the document named by the url path', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve('')
      },
    })

    await bootstrap({ root, pathname: '/doc/journal/2026.md', session })

    expect(loaded).toStrictEqual(['journal/2026.md'])
  })

  it('loads the folder index when the url names no document', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve('')
      },
    })

    await bootstrap({ root, pathname: '/doc/', session })

    expect(loaded).toStrictEqual(['index.md'])
  })

  it('reports the document being edited in the status element', async () => {
    await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(statusText(root)).toContain('Editing notes.md')
  })

  it('throws when the mount point is missing', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })

    await expect(bootstrap({ root: bare, pathname: '/doc/', session: fakeSession() })).rejects.toThrow(
      MissingMountError,
    )
  })

  it('reports a missing mount point in the status element', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })

    await expect(bootstrap({ root: bare, pathname: '/doc/', session: fakeSession() })).rejects.toThrow(
      MissingMountError,
    )
    expect(statusText(bare)).toContain('Missing editor mount point')
  })

  it('works when there is no status element to write to', async () => {
    document.body.innerHTML = ''
    const bare = page({ withStatus: false })

    await expect(bootstrap({ root: bare, pathname: '/doc/', session: fakeSession() })).resolves.toBeDefined()
  })

  it('falls back to the live document, location and api session when given no options', async () => {
    document.body.innerHTML = '<span id="status"></span><div id="editor"></div>'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('# from the api', { headers: { 'content-type': 'text/markdown' } })),
    )

    const view = await bootstrap()

    expect(view.state.doc.toString()).toBe('# from the api')
    expect(statusText(document)).toContain('Editing index.md')
    vi.unstubAllGlobals()
  })
})

describe('saving', () => {
  it('writes the current document through the session', async () => {
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession() })
    view.dispatch({ changes: { from: 0, insert: 'extra ' } })

    await pressSave(view)

    expect(saved).toStrictEqual([{ id: 'notes.md', content: 'extra # notes.md' }])
  })

  it('reports a successful save', async () => {
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession() })
    await pressSave(view)

    expect(statusText(root)).toBe('Saved notes.md')
  })

  it('reports a failed save without throwing', async () => {
    const session = fakeSession({ save: () => Promise.reject(new Error('server exploded')) })
    const view = await bootstrap({ root, pathname: '/doc/notes.md', session })

    await pressSave(view)

    expect(statusText(root)).toBe('Save failed: server exploded')
  })
})

describe('bootstrapOrReport', () => {
  it('returns the view on success', async () => {
    await expect(bootstrapOrReport({ root, pathname: '/doc/', session: fakeSession() })).resolves.not.toBeNull()
  })

  it('resolves to null instead of rejecting when the mount is missing', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })

    await expect(bootstrapOrReport({ root: bare, pathname: '/doc/', session: fakeSession() })).resolves.toBeNull()
  })

  it('reports the failure in the status element', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })
    await bootstrapOrReport({ root: bare, pathname: '/doc/', session: fakeSession() })

    expect(statusText(bare)).toContain('Failed to start')
  })

  it('survives a page with neither mount nor status element', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false, withStatus: false })

    await expect(bootstrapOrReport({ root: bare, pathname: '/doc/', session: fakeSession() })).resolves.toBeNull()
  })

  it('falls back to the live document when given no options', async () => {
    document.body.innerHTML = '<span id="status"></span>'

    await expect(bootstrapOrReport()).resolves.toBeNull()
    expect(statusText(document)).toContain('Failed to start')
  })
})

async function pressSave(view: EditorView): Promise<void> {
  view.contentDOM.dispatchEvent(
    new KeyboardEvent('keydown', { key: 's', code: 'KeyS', ctrlKey: true, bubbles: true, cancelable: true }),
  )
  await Promise.resolve()
  await Promise.resolve()
}

describe('bootstrap follows a document that moves underneath it', () => {
  async function editing(pathname: string, navigated: string[]): Promise<EditorView> {
    return await bootstrap({
      root,
      pathname,
      session: fakeSession(),
      navigate: (url) => {
        navigated.push(url)
      },
    })
  }

  it('moves the session etag to the new path', async () => {
    const navigated: string[] = []
    await editing('/doc/notes.md', navigated)

    announceDocumentMoved(root, { from: 'notes.md', to: 'archive/notes.md', rewritten: [] })

    expect(renamed).toStrictEqual([{ from: 'notes.md', to: 'archive/notes.md' }])
  })

  it('rewrites the address bar to the new path', async () => {
    const navigated: string[] = []
    await editing('/doc/notes.md', navigated)

    announceDocumentMoved(root, { from: 'notes.md', to: 'archive/my notes.md', rewritten: [] })

    expect(navigated).toStrictEqual(['/doc/archive/my%20notes.md'])
  })

  it('follows a document carried by a folder move', async () => {
    const navigated: string[] = []
    await editing('/doc/journal/2026/a.md', navigated)

    announceDocumentMoved(root, { from: 'journal', to: 'archive/journal', rewritten: [] })

    expect(renamed).toStrictEqual([{ from: 'journal/2026/a.md', to: 'archive/journal/2026/a.md' }])
  })

  it('ignores a move of some other document', async () => {
    const navigated: string[] = []
    await editing('/doc/notes.md', navigated)

    announceDocumentMoved(root, { from: 'other.md', to: 'archive/other.md', rewritten: [] })

    expect(renamed).toStrictEqual([])
    expect(navigated).toStrictEqual([])
  })

  it('says where the document went', async () => {
    const navigated: string[] = []
    await editing('/doc/notes.md', navigated)

    announceDocumentMoved(root, { from: 'notes.md', to: 'archive/notes.md', rewritten: [] })

    expect(statusText(root)).toContain('archive/notes.md')
  })

  it('warns when the move repaired links inside the open document', async () => {
    const navigated: string[] = []
    await editing('/doc/notes.md', navigated)

    announceDocumentMoved(root, { from: 'journal', to: 'archive', rewritten: ['notes.md'] })

    expect(statusText(root)).toContain('reload')
  })

  it('warns about a repair even when the open document also moved', async () => {
    const navigated: string[] = []
    await editing('/doc/journal/a.md', navigated)

    announceDocumentMoved(root, { from: 'journal', to: 'archive', rewritten: ['archive/a.md'] })

    expect(statusText(root)).toContain('reload')
  })

  it('replaces the address in real browser history rather than pushing an entry', async () => {
    const {
      location: { pathname: before },
    } = window
    try {
      await bootstrap({ root, pathname: '/doc/notes.md', session: fakeSession() })

      announceDocumentMoved(root, { from: 'notes.md', to: 'archive/notes.md', rewritten: [] })

      expect(window.location.pathname).toBe('/doc/archive/notes.md')
    } finally {
      window.history.replaceState(null, '', before)
    }
  })

  it('stays quiet when the repair touched some other document', async () => {
    const navigated: string[] = []
    await editing('/doc/notes.md', navigated)

    announceDocumentMoved(root, { from: 'journal', to: 'archive', rewritten: ['elsewhere.md'] })

    expect(statusText(root)).not.toContain('reload')
  })
})
