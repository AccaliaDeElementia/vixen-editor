'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { cast } from '../../../cast.ts'
import { joinPath } from '../../../../src/shared/store-path.ts'
import { EditorState } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import type { FilesClient } from '../../../../src/client/files/files-client.ts'

import { TestOnly } from '../../../../src/client/editor/bootstrap.ts'
import type { Session } from '../../../../src/client/editor/session.ts'

import { openEditor, page, recorded, sessionRecording, type Recorded } from '../../editor-fixtures.ts'

const { startsALine } = TestOnly

async function afterTheBufferChanges(view: EditorView): Promise<void> {
  const changed: PromiseWithResolvers<void> = Promise.withResolvers()
  const observer = new MutationObserver(() => {
    observer.disconnect()
    changed.resolve()
  })
  observer.observe(view.contentDOM, { childList: true, subtree: true, characterData: true })

  await changed.promise
}

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
    const view = await openEditor({
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

describe('dropping an entry from the file browser', () => {
  function dropOn(view: { contentDOM: HTMLElement }, entries: Record<string, string>): void {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { getData: (type: string) => entries[type] ?? '', types: Object.keys(entries), files: [] },
      configurable: true,
    })
    Object.defineProperty(event, 'clientX', { value: 0, configurable: true })
    Object.defineProperty(event, 'clientY', { value: 0, configurable: true })
    view.contentDOM.dispatchEvent(event)
  }

  it('inserts a link to the dropped document, relative to the one open', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const view = await openEditor({ root, pathname: '/doc/journal/notes.md', session })

    dropOn(view, {
      'application/x-vixen-path': 'journal/other.md',
      'application/x-vixen-kind': 'document',
    })

    expect(view.state.doc.toString()).toBe('[other.md](other.md)')
  })

  it('embeds a dropped image rather than linking it', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const view = await openEditor({ root, pathname: '/doc/notes.md', session })

    dropOn(view, { 'application/x-vixen-path': 'p.png', 'application/x-vixen-kind': 'image' })

    expect(view.state.doc.toString()).toBe('![p.png](p.png)')
  })

  it('leaves the caret after what it inserted, ready to keep typing', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const view = await openEditor({ root, pathname: '/doc/notes.md', session })

    dropOn(view, { 'application/x-vixen-path': 'a.md', 'application/x-vixen-kind': 'document' })

    expect(view.state.selection.main.head).toBe(view.state.doc.length)
  })

  it('counts as an edit, so the autosave window restarts', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const view = await openEditor({ root, pathname: '/doc/notes.md', session })

    dropOn(view, { 'application/x-vixen-path': 'a.md', 'application/x-vixen-kind': 'document' })

    expect(root.querySelector('[data-part="save-label"]')?.textContent).toBe('Save pending')
  })
})

describe('dropping files from outside the browser', () => {
  function dropFilesOn(view: { contentDOM: HTMLElement }, files: File[]): void {
    const event = new Event('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
      value: { types: ['Files'], files, getData: () => '' },
      configurable: true,
    })
    Object.defineProperty(event, 'clientX', { value: 0, configurable: true })
    Object.defineProperty(event, 'clientY', { value: 0, configurable: true })
    view.contentDOM.dispatchEvent(event)
  }

  it('uploads beside the open document', async () => {
    const uploaded: string[] = []
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const files = cast<FilesClient>({
      upload: (directory: string, file: File) => {
        uploaded.push(joinPath(directory, file.name))

        return Promise.resolve(joinPath(directory, file.name))
      },
    })
    const view = await openEditor({ root, pathname: '/doc/journal/notes.md', session, files })

    dropFilesOn(view, [new File(['x'], 'p.png')])

    await afterTheBufferChanges(view)

    expect(uploaded).toStrictEqual(['journal/p.png'])
  })

  it('embeds what it stored', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const files = cast<FilesClient>({
      upload: (directory: string, file: File) => Promise.resolve(joinPath(directory, file.name)),
    })
    const view = await openEditor({ root, pathname: '/doc/journal/notes.md', session, files })

    dropFilesOn(view, [new File(['x'], 'p.png')])

    await afterTheBufferChanges(view)

    expect(view.state.doc.toString()).toBe('![p.png](p.png)')
  })

  it('puts one link per line when several arrive at once', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: true }) })
    const files = cast<FilesClient>({
      upload: (directory: string, file: File) => Promise.resolve(joinPath(directory, file.name)),
    })
    const view = await openEditor({ root, pathname: '/doc/notes.md', session, files })

    dropFilesOn(view, [new File(['x'], 'a.png'), new File(['x'], 'b.png')])

    await afterTheBufferChanges(view)

    expect(view.state.doc.toString()).toBe('![a.png](a.png)\n![b.png](b.png)')
  })
})

describe('whether a drop position starts a line', () => {
  function stateWith(doc: string): EditorState {
    return EditorState.create({ doc })
  }

  it('says yes at the very beginning', () => {
    expect(startsALine(stateWith('one\ntwo'), 0)).toBe(true)
  })

  it('says yes at the start of a later line', () => {
    expect(startsALine(stateWith('one\ntwo'), 4)).toBe(true)
  })

  it('says no in the middle of a line, which is where the break is needed', () => {
    expect(startsALine(stateWith('one\ntwo'), 2)).toBe(false)
  })

  it('says yes when there is no position, because the caret is where it will land', () => {
    expect(startsALine(stateWith('one'), null)).toBe(true)
  })
})
