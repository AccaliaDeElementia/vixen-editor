'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { TestOnly } from '../../src/client/editor/bootstrap.ts'
import type { Session } from '../../src/client/editor/session.ts'

import type { FilesClient } from '../../src/client/files/files-client.ts'

import { cast } from '../cast.ts'
import { openEditor, page, recorded, sessionRecording, statusText, type Recorded } from './editor-fixtures.ts'

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

    await bootstrap({ root, pathname: '/doc/journal/gone.md', session })

    expect(statusText(root)).toContain('journal/gone.md is not in the store')
  })

  it('announces an image, which replaces the editor entirely', async () => {
    await bootstrap({ root, pathname: '/doc/photo.png', session: fakeSession() })

    expect(statusText(root)).toContain('Viewing photo.png')
  })

  it('announces a document it could not load', async () => {
    const session = fakeSession({ load: () => Promise.reject(new Error('network down')) })

    await bootstrap({ root, pathname: '/doc/notes.md', session })

    expect(statusText(root)).toContain('could not be loaded')
  })
})
