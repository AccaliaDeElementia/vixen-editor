'use sanity'

import { given, givenAsync } from '../../../conditions.ts'
import { EditorView } from '@codemirror/view'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { announceDocumentMoved } from '../../../../src/client/document-moved.ts'
import { requestInsert } from '../../../../src/client/insert-entry.ts'
import { recallCaret, rememberCaret } from '../../../../src/client/editor/carets.ts'
import { bootstrapOrReport, TestOnly } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'

import { cast } from '../../../cast.ts'
import {
  openEditor,
  page,
  pressSave,
  recorded,
  sessionRecording,
  statusText,
  trackEditor,
  type Recorded,
} from '../../editor-fixtures.ts'

const { MissingMountError } = TestOnly

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

const LONG_ENOUGH = 5000

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bootstrap', () => {
  it('mounts an editor into the configured selector', async () => {
    await openEditor({ root, pathname: '/doc/', session: fakeSession() })

    expect(root.querySelector('#editor .cm-editor')).not.toBeNull()
  })

  it('seeds the editor with the loaded document', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(view.state.doc.toString()).toBe('# notes.md')
  })

  it('loads the document named by the url path', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve({ content: '', stored: true })
      },
    })

    await openEditor({ root, pathname: '/doc/journal/2026.md', session })

    expect(loaded).toStrictEqual(['journal/2026.md'])
  })

  it('loads the folder index when the url names no document', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)
        return Promise.resolve({ content: '', stored: true })
      },
    })

    await openEditor({ root, pathname: '/doc/', session })

    expect(loaded).toStrictEqual(['index.md'])
  })

  it('reports the document being edited in the status element', async () => {
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(statusText(root)).toContain('Editing notes.md')
  })

  it('throws when the mount point is missing', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })

    await expect(openEditor({ root: bare, pathname: '/doc/', session: fakeSession() })).rejects.toThrow(
      MissingMountError,
    )
  })

  it('reports a missing mount point in the status element', async () => {
    document.body.innerHTML = ''
    const bare = page({ withMount: false })

    await givenAsync(
      expect(openEditor({ root: bare, pathname: '/doc/', session: fakeSession() })).rejects.toThrow(MissingMountError),
    )

    expect(statusText(bare)).toContain('Missing editor mount point')
  })

  it('works when there is no status element to write to', async () => {
    document.body.innerHTML = ''
    const bare = page({ withStatus: false })

    await expect(openEditor({ root: bare, pathname: '/doc/', session: fakeSession() })).resolves.toBeDefined()
  })

  it('falls back to the live document, location and api session when given no options', async () => {
    document.body.innerHTML = '<span id="status"></span><div id="editor"></div>'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('# from the api', { headers: { 'content-type': 'text/markdown' } })),
    )

    const view = await openEditor()

    expect(view.state.doc.toString()).toBe('# from the api')
    vi.unstubAllGlobals()
  })

  it('falls back to the live location when given no options', async () => {
    document.body.innerHTML = '<span id="status"></span><div id="editor"></div>'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('# from the api', { headers: { 'content-type': 'text/markdown' } })),
    )

    await openEditor()

    expect(statusText(document)).toContain('Editing index.md')
    vi.unstubAllGlobals()
  })
})

describe('saving', () => {
  it('writes the current document through the session', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })
    view.dispatch({ changes: { from: 0, insert: 'extra ' } })

    await pressSave(view, root)

    expect(record.saved).toStrictEqual([{ id: 'notes.md', content: 'extra # notes.md' }])
  })

  it('reports a successful save', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })
    view.dispatch({ changes: { from: 0, insert: 'extra ' } })

    await pressSave(view, root)

    expect(statusText(root)).toBe('Saved notes.md')
  })

  it('reports a failed save without throwing', async () => {
    const session = fakeSession({ save: () => Promise.reject(new Error('server exploded')) })
    const view = await openEditor({ root, pathname: '/doc/notes.md', session })
    view.dispatch({ changes: { from: 0, insert: 'extra ' } })

    await pressSave(view, root)

    expect(statusText(root)).toBe('Save failed: server exploded')
  })

  it('does not treat moving the caret as an edit', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })
    view.dispatch({ selection: { anchor: 1 } })

    await pressSave(view, root)

    expect(record.saved).toStrictEqual([])
  })

  it('writes nothing when the buffer matches what was loaded', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    await pressSave(view, root)

    expect(record.saved).toStrictEqual([])
  })

  it('says so rather than claiming a save that did not happen', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    await pressSave(view, root)

    expect(statusText(root)).toBe('No changes in notes.md')
  })
})

describe('bootstrapOrReport', () => {
  it('returns the view on success', async () => {
    const started = trackEditor(await bootstrapOrReport({ root, pathname: '/doc/', session: fakeSession() }))

    expect(started?.view).toBeInstanceOf(EditorView)
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

    await givenAsync(expect(bootstrapOrReport()).resolves.toBeNull())

    expect(statusText(document)).toContain('Failed to start')
  })
})

describe('bootstrap follows a document that moves underneath it', () => {
  async function editing(pathname: string, navigated: string[]): Promise<EditorView> {
    return await openEditor({
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

    expect(record.renamed).toStrictEqual([{ from: 'notes.md', to: 'archive/notes.md' }])
  })

  it('re-resolves the links in the buffer against where the document landed', async () => {
    const navigated: string[] = []
    const view = await openEditor({
      root,
      pathname: '/doc/journal/notes.md',
      session: sessionRecording(record, {
        load: () => Promise.resolve({ content: 'see [the gap](nothing.md)', stored: true }),
      }),
      navigate: (url) => {
        navigated.push(url)
      },
    })

    given(() => {
      expect(view.dom.querySelector('.cm-vixen-link')?.getAttribute('title')).toBe(
        'Ctrl/Cmd+click to open journal/nothing.md',
      )
    })

    announceDocumentMoved(root, { from: 'journal/notes.md', to: 'archive/notes.md', rewritten: [] })

    expect(view.dom.querySelector('.cm-vixen-link')?.getAttribute('title')).toBe(
      'Ctrl/Cmd+click to open archive/nothing.md',
    )
  })

  it('opens the link the caret is in when Mod-Enter is pressed', async () => {
    const opened: string[] = []
    const view = await openEditor({
      root,
      pathname: '/doc/journal/notes.md',
      session: sessionRecording(record, {
        load: () => Promise.resolve({ content: 'see [the doc](other.md) here', stored: true }),
      }),
      openUrl: (url) => {
        opened.push(url)
      },
    })

    view.dispatch({ selection: { anchor: 8 } })
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
    )

    expect(opened).toStrictEqual(['/doc/journal/other.md'])
  })

  it('leaves Mod-Enter alone when the caret is not in a link', async () => {
    const opened: string[] = []
    const view = await openEditor({
      root,
      pathname: '/doc/journal/notes.md',
      session: sessionRecording(record, {
        load: () => Promise.resolve({ content: 'see [the doc](other.md) here', stored: true }),
      }),
      openUrl: (url) => {
        opened.push(url)
      },
    })

    view.dispatch({ selection: { anchor: 1 } })
    view.contentDOM.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', ctrlKey: true, bubbles: true, cancelable: true }),
    )

    expect(opened).toStrictEqual([])
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

    expect(record.renamed).toStrictEqual([{ from: 'journal/2026/a.md', to: 'archive/journal/2026/a.md' }])
  })

  it('ignores a move of some other document', async () => {
    const navigated: string[] = []
    await editing('/doc/notes.md', navigated)

    announceDocumentMoved(root, { from: 'other.md', to: 'archive/other.md', rewritten: [] })

    expect({ renamed: record.renamed, navigated }).toStrictEqual({ renamed: [], navigated: [] })
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
      await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

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

describe('inserting an entry the file browser picked', () => {
  it('writes a link relative to the document holding it', async () => {
    const view = await openEditor({ root, pathname: '/doc/journal/notes.md', session: fakeSession() })

    requestInsert(root, 'journal/other.md')

    expect(view.state.doc.toString()).toContain('[other.md](other.md)')
  })

  it('says what it inserted, so the tree gets an answer it did not have to watch for', async () => {
    await openEditor({ root, pathname: '/doc/journal/notes.md', session: fakeSession() })

    requestInsert(root, 'journal/other.md')

    expect(statusText(root)).toContain('Inserted a link to journal/other.md')
  })

  it('says why it cannot when the workspace is showing something other than a document', async () => {
    const view = await openEditor({ root, pathname: '/doc/photo.png', session: fakeSession() })

    requestInsert(root, 'journal/other.md')

    expect({ said: statusText(root), doc: view.state.doc.toString() }).toStrictEqual({
      said: 'Open a document before inserting journal/other.md',
      doc: '',
    })
  })
})

describe('leaving the page with the buffer dirty', () => {
  interface Leaving {
    view: EditorView
    leave: () => BeforeUnloadEvent
  }

  async function opened(pathname = '/doc/notes.md'): Promise<Leaving> {
    let handler: (event: BeforeUnloadEvent) => void = () => undefined
    const view = await openEditor({
      root,
      pathname,
      session: fakeSession(),
      listenForUnload: (registered) => {
        handler = registered

        return () => undefined
      },
    })

    return {
      view,
      leave: () => {
        const event = cast<BeforeUnloadEvent>(new Event('beforeunload', { cancelable: true }))
        handler(event)

        return event
      },
    }
  }

  function type(view: EditorView, text: string): void {
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } })
  }

  it('prompts, because an autosave window may still be running', async () => {
    const { view, leave } = await opened()

    type(view, '# edited')

    expect(leave().defaultPrevented).toBe(true)
  })

  it('does not prompt when nothing has been typed', async () => {
    const { leave } = await opened()

    expect(leave().defaultPrevented).toBe(false)
  })

  it('sends the buffer as a last attempt, under the document it is currently editing', async () => {
    const { view, leave } = await opened()

    type(view, '# edited')
    leave()

    expect(record.rescued).toStrictEqual([{ id: 'notes.md', content: '# edited' }])
  })

  it('still prompts for a buffer emptied to nothing, which is a change that cannot be saved', async () => {
    const { view, leave } = await opened()

    type(view, '   ')

    expect(leave().defaultPrevented).toBe(true)
  })

  it('sends nothing for that empty buffer, because the store refuses it', async () => {
    const { view, leave } = await opened()

    type(view, '   ')
    leave()

    expect(record.rescued).toStrictEqual([])
  })
})

describe('the caret across a reload', () => {
  async function open(pathname: string): Promise<EditorView> {
    return await openEditor({ root, pathname, session: fakeSession() })
  }

  it('opens at the top when nothing is remembered', async () => {
    const view = await open('/doc/notes.md')

    expect(view.state.selection.main.head).toBe(0)
  })

  it('opens where the caret was left', async () => {
    rememberCaret('notes.md', 5)

    const view = await open('/doc/notes.md')

    expect(view.state.selection.main.head).toBe(5)
  })

  it('clamps a caret past the end, because the document may have shrunk elsewhere', async () => {
    rememberCaret('notes.md', 5000)

    const view = await open('/doc/notes.md')

    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })

  it('records the caret on a save, so a crash costs only the edits since', async () => {
    const view = await open('/doc/notes.md')
    view.dispatch({ changes: { from: 0, insert: 'extra ' }, selection: { anchor: 4 } })

    await pressSave(view, root)

    expect(recallCaret('notes.md', LONG_ENOUGH)).toBe(4)
  })

  it('records nothing when the save failed, so the position still matches what is stored', async () => {
    const session = fakeSession({ save: () => Promise.reject(new Error('server exploded')) })
    const view = await openEditor({ root, pathname: '/doc/notes.md', session })
    view.dispatch({ changes: { from: 0, insert: 'extra ' }, selection: { anchor: 4 } })

    await pressSave(view, root)

    expect(recallCaret('notes.md', LONG_ENOUGH)).toBe(0)
  })

  it('carries the caret to the new path when the document moves', async () => {
    rememberCaret('notes.md', 5)
    await open('/doc/notes.md')

    announceDocumentMoved(root, { from: 'notes.md', to: 'archive/notes.md', rewritten: [] })

    expect(recallCaret('archive/notes.md', LONG_ENOUGH)).toBe(5)
  })
})

describe('the default way back to a page whose document now exists', () => {
  it('reloads, because the document is created by a request the editor did not make', () => {
    const reload = vi.fn<() => void>()
    vi.spyOn(window, 'location', 'get').mockReturnValue(cast<Location>({ reload }))

    TestOnly.reloadPage()

    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('the default way to a different page', () => {
  it('assigns the location, because a restored document lives at a path the editor is not on', () => {
    const assign = vi.fn<(url: string) => void>()
    vi.spyOn(window, 'location', 'get').mockReturnValue(cast<Location>({ assign }))

    TestOnly.openPage('/doc/journal/a.md')

    expect(assign).toHaveBeenCalledWith('/doc/journal/a.md')
  })
})

describe('long lines', () => {
  it('are marked for wrapping rather than left to scroll sideways', async () => {
    const view = await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(view.contentDOM.classList.contains('cm-lineWrapping')).toBe(true)
  })
})

describe('a folder index that is not index.md', () => {
  function holding(stored: string): Session {
    return fakeSession({
      load: (id: string) => Promise.resolve({ content: `# ${id}`, stored: id === stored }),
    })
  }

  it('opens index.txt when the folder has no index.md', async () => {
    const view = await openEditor({ root, pathname: '/doc/journal/', session: holding('journal/index.txt') })

    expect(view.state.doc.toString()).toBe('# journal/index.txt')
  })

  it('edits it under its own name, so saving cannot create index.md beside it', async () => {
    await openEditor({ root, pathname: '/doc/journal/', session: holding('journal/index.txt') })

    expect(statusText(root)).toContain('Editing journal/index.txt')
  })

  it('writes a save back to the index the folder actually holds', async () => {
    const view = await openEditor({ root, pathname: '/doc/journal/', session: holding('journal/index.txt') })
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\nmore' } })

    await pressSave(view, root)

    expect(record.saved.map((write) => write.id)).toStrictEqual(['journal/index.txt'])
  })

  it('asks for index.md first, so a folder holding both opens the markdown one', async () => {
    const loaded: string[] = []
    const session = fakeSession({
      load: (id: string) => {
        loaded.push(id)

        return Promise.resolve({ content: `# ${id}`, stored: true })
      },
    })

    await openEditor({ root, pathname: '/doc/journal/', session })

    expect(loaded).toStrictEqual(['journal/index.md'])
  })

  it('still offers a new index.md when the folder holds neither', async () => {
    const view = await openEditor({ root, pathname: '/doc/journal/', session: holding('no index at all') })

    expect(view.state.doc.toString()).toContain('# journal/index.md')
  })

  it('reports the folder unreachable when the second index cannot be read', async () => {
    const session = fakeSession({
      load: (id: string) =>
        id === 'journal/index.txt'
          ? Promise.reject(new Error('offline'))
          : Promise.resolve({ content: '', stored: false }),
    })

    await openEditor({ root, pathname: '/doc/journal/', session })

    expect(statusText(root)).toContain('offline')
  })
})
