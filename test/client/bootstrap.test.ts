'use sanity'

import type { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bootstrap,
  bootstrapOrReport,
  DEFAULT_DOCUMENT,
  describeError,
  documentIdFromSearch,
  MissingMountError,
} from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'

let root: HTMLElement
let saved: Array<{ id: string; content: string }>

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
    ...overrides,
  }
}

function statusText(container: ParentNode): string {
  return container.querySelector('#status')?.textContent ?? ''
}

beforeEach(() => {
  saved = []
  document.body.innerHTML = ''
  root = page()
})

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('documentIdFromSearch', () => {
  it('reads the doc query parameter', () => {
    expect(documentIdFromSearch('?doc=journal/2026.md')).toBe('journal/2026.md')
  })

  it('falls back to the default document when absent', () => {
    expect(documentIdFromSearch('')).toBe(DEFAULT_DOCUMENT)
  })

  it('falls back when another parameter is present', () => {
    expect(documentIdFromSearch('?theme=dark')).toBe(DEFAULT_DOCUMENT)
  })

  it('tolerates a leading question mark being absent', () => {
    expect(documentIdFromSearch('doc=notes.md')).toBe('notes.md')
  })
})

describe('describeError', () => {
  it('uses the message of a real error', () => {
    expect(describeError(new Error('boom'))).toBe('boom')
  })

  it('falls back for a non-error value', () => {
    expect(describeError('a string')).toBe('unknown error')
  })
})

describe('bootstrap', () => {
  it('mounts an editor into the configured selector', async () => {
    await bootstrap({ root, search: '', session: fakeSession() })

    expect(root.querySelector('#editor .cm-editor')).not.toBeNull()
  })

  it('seeds the editor with the loaded document', async () => {
    const view = await bootstrap({ root, search: '?doc=notes.md', session: fakeSession() })

    expect(view.state.doc.toString()).toBe('# notes.md')
  })

  it('loads the document named by the query string', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve('')
      },
    })

    await bootstrap({ root, search: '?doc=journal/2026.md', session })

    expect(loaded).toStrictEqual(['journal/2026.md'])
  })

  it('loads the default document when the query string is empty', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve('')
      },
    })

    await bootstrap({ root, search: '', session })

    expect(loaded).toStrictEqual([DEFAULT_DOCUMENT])
  })

  it('reports the document being edited in the status element', async () => {
    await bootstrap({ root, search: '?doc=notes.md', session: fakeSession() })

    expect(statusText(root)).toContain('Editing notes.md')
  })

  it('throws when the mount point is missing', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })

    await expect(bootstrap({ root: bare, search: '', session: fakeSession() })).rejects.toThrow(MissingMountError)
  })

  it('reports a missing mount point in the status element', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })

    await expect(bootstrap({ root: bare, search: '', session: fakeSession() })).rejects.toThrow(MissingMountError)
    expect(statusText(bare)).toContain('Missing editor mount point')
  })

  it('works when there is no status element to write to', async () => {
    document.body.innerHTML = ''
    const bare = page({ withStatus: false })

    await expect(bootstrap({ root: bare, search: '', session: fakeSession() })).resolves.toBeDefined()
  })

  it('falls back to the live document, location and api session when given no options', async () => {
    document.body.innerHTML = '<span id="status"></span><div id="editor"></div>'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('# from the api', { headers: { 'content-type': 'text/markdown' } })),
    )

    const view = await bootstrap()

    expect(view.state.doc.toString()).toBe('# from the api')
    expect(statusText(document)).toContain(`Editing ${DEFAULT_DOCUMENT}`)
    vi.unstubAllGlobals()
  })
})

describe('saving', () => {
  it('writes the current document through the session', async () => {
    const view = await bootstrap({ root, search: '?doc=notes.md', session: fakeSession() })
    view.dispatch({ changes: { from: 0, insert: 'extra ' } })

    await pressSave(view)

    expect(saved).toStrictEqual([{ id: 'notes.md', content: 'extra # notes.md' }])
  })

  it('reports a successful save', async () => {
    const view = await bootstrap({ root, search: '?doc=notes.md', session: fakeSession() })
    await pressSave(view)

    expect(statusText(root)).toBe('Saved notes.md')
  })

  it('reports a failed save without throwing', async () => {
    const session = fakeSession({ save: () => Promise.reject(new Error('server exploded')) })
    const view = await bootstrap({ root, search: '?doc=notes.md', session })

    await pressSave(view)

    expect(statusText(root)).toBe('Save failed: server exploded')
  })
})

describe('bootstrapOrReport', () => {
  it('returns the view on success', async () => {
    await expect(bootstrapOrReport({ root, search: '', session: fakeSession() })).resolves.not.toBeNull()
  })

  it('resolves to null instead of rejecting when the mount is missing', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })

    await expect(bootstrapOrReport({ root: bare, search: '', session: fakeSession() })).resolves.toBeNull()
  })

  it('reports the failure in the status element', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })
    await bootstrapOrReport({ root: bare, search: '', session: fakeSession() })

    expect(statusText(bare)).toContain('Failed to start')
  })

  it('survives a page with neither mount nor status element', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false, withStatus: false })

    await expect(bootstrapOrReport({ root: bare, search: '', session: fakeSession() })).resolves.toBeNull()
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
