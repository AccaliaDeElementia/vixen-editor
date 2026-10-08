'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import type { EditorView } from '@codemirror/view'

import { announceEntryTrashed, settleBeforeDeleting } from '../../../../src/client/entry-deletion.ts'
import type { Session } from '../../../../src/client/editor/session.ts'

import type { FilesClient } from '../../../../src/client/files/files-client.ts'

import { cast } from '../../../cast.ts'
import { bootstrapOrReport } from '../../../../src/client/editor/bootstrap.ts'
import { givenAsync } from '../../../conditions.ts'
import {
  dialogsDismissing,
  filesAnsweringEmpty,
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

function fakeSession(overrides: Partial<Session> = {}): Session {
  return sessionRecording(record, overrides)
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('the first document of an empty workspace', () => {
  function emptyStore(): FilesClient {
    return cast<FilesClient>({ tree: () => Promise.resolve([]) })
  }

  function populatedStore(): FilesClient {
    return cast<FilesClient>({ tree: () => Promise.resolve([{ name: 'a.md', path: 'a.md', kind: 'document' }]) })
  }

  async function contentOf(files: FilesClient, pathname: string): Promise<string> {
    const view = await openEditor({
      root,
      pathname,
      files,
      session: fakeSession({ load: () => Promise.resolve({ content: '# index\n', stored: false }) }),
    })

    return view.state.doc.toString()
  }

  it.each(['# index', '## Keyboard', 'Ctrl/Cmd + S'])(
    'starts with a cheatsheet holding %s, so the gestures are discoverable at all',
    async (fragment) => {
      expect(await contentOf(emptyStore(), '/doc/')).toContain(fragment)
    },
  )

  it('is the plain template once the store has anything in it', async () => {
    expect(await contentOf(populatedStore(), '/doc/')).toBe('# index\n')
  })

  it('is the plain template when the store cannot be read, rather than a guess', async () => {
    const unreachable = cast<FilesClient>({ tree: () => Promise.reject(new Error('network down')) })

    expect(await contentOf(unreachable, '/doc/')).toBe('# index\n')
  })

  it('is the plain template for a folder below the root', async () => {
    expect(await contentOf(emptyStore(), '/doc/journal/')).toBe('# index\n')
  })
})

describe('what a screen reader is told when the workspace changes', () => {
  it('announces the document it opened', async () => {
    await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession() })

    expect(statusText(root)).toContain('Editing notes.md')
  })

  it('announces a path that is not in the store', async () => {
    const session = fakeSession({ load: () => Promise.resolve({ content: '', stored: false }) })

    await openEditor({ root, pathname: '/doc/journal/gone.md', session })

    expect(statusText(root)).toContain('journal/gone.md is not in the store')
  })

  it('announces an image, which replaces the editor entirely', async () => {
    await openEditor({ root, pathname: '/doc/photo.png', session: fakeSession() })

    expect(statusText(root)).toContain('Viewing photo.png')
  })

  it('says in the view itself that a document could not be loaded, since that is a state and not an event', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await openEditor({ root, pathname: '/doc/notes.md', session })

    expect(root.querySelector('[data-part="unreachable-reason"]')?.textContent).toContain('could not be loaded')
  })

  it('says nothing in the status region, which is for what the reader just did', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await openEditor({ root, pathname: '/doc/notes.md', session })

    expect(statusText(root)).toBe('')
  })
})

describe('when the document being edited is deleted', () => {
  let opened: string[] = []

  async function editing(pathname: string): Promise<EditorView> {
    return await openEditor({
      root,
      pathname,
      session: fakeSession(),
      openUrl: (url: string) => {
        opened.push(url)
      },
    })
  }

  beforeEach(() => {
    opened = []
  })

  it('is asked to save before the entry goes', async () => {
    const view = await editing('/doc/journal/a.md')
    view.dispatch({ changes: { from: view.state.doc.length, insert: '\nunsaved' } })

    await settleBeforeDeleting(root, 'journal/a.md')

    expect(record.saved.map((write) => write.id)).toStrictEqual(['journal/a.md'])
  })

  it('follows the document to the trash entry it became', async () => {
    await editing('/doc/journal/a.md')

    announceEntryTrashed(root, { entryPath: 'journal/a.md', trashId: 'abc-123' })

    expect(opened).toStrictEqual(['/trash/abc-123'])
  })
})

describe('a tab that closed to make room for the one being opened', () => {
  async function lookedAtBothPreviews(): Promise<void> {
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

    root.querySelector<HTMLElement>('#preview-markup')?.click()
    await givenAsync(editor.settled())
    root.querySelector<HTMLElement>('#preview-source')?.click()
    await givenAsync(editor.settled())
  }

  it('is announced, because a tab vanishing otherwise reads as losing the document', async () => {
    await lookedAtBothPreviews()

    expect(root.querySelector('#status')?.textContent).toContain('Closed notes.md, preview')
  })

  it('says why it went, which is the rule the italic was standing for', async () => {
    await lookedAtBothPreviews()

    expect(root.querySelector('#status')?.textContent).toContain('only being looked at')
  })
})
