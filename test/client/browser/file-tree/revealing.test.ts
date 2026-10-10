'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { openDocumentIn } from '../../../../src/client/platform/navigation.ts'
import { parseTree } from '../../../../src/client/browser/tree/tree-model.ts'
import { ROW_SELECTOR } from '../../../../src/client/browser/tree/drawing.ts'
import type { Dialogs } from '../../../../src/client/platform/dialogs.ts'
import type { FilesClient } from '../../../../src/client/browser/files-client.ts'
import { cast } from '../../../cast.ts'
import { fakeClient, mountTree, rowFor, treePage, type FakeClient } from '../fixtures.ts'

const SAMPLE = parseTree({
  tree: [
    {
      name: 'journal',
      path: 'journal',
      kind: 'folder',
      children: [{ name: 'entry.md', path: 'journal/entry.md', kind: 'document' }],
    },
    { name: 'notes.md', path: 'notes.md', kind: 'document' },
  ],
})

let host: HTMLElement = document.createElement('div')

let typed = 'typed-name.md'

interface PromptLike {
  nameFor?: (value: string) => string
  submit: (value: string) => Promise<string | null>
}

function fakeDialogs(): { prompt: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> } {
  return {
    prompt: vi.fn(async (request: PromptLike) => {
      await request.submit(request.nameFor === undefined ? typed : request.nameFor(typed))
      return true
    }),
    confirm: vi.fn().mockResolvedValue(true),
  }
}

let client: FakeClient = fakeClient(SAMPLE)
let dialogs: ReturnType<typeof fakeDialogs> = fakeDialogs()

let opened: string[] = []

async function start(pathname = '/doc/'): Promise<void> {
  await mountTree({
    root: host,
    pathname,
    client: cast<FilesClient>(client),
    dialogs: cast<Dialogs>(dialogs),
    navigate: (url: string) => {
      opened.push(url)
    },
  })
}

function press(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.click()
}

beforeEach(() => {
  localStorage.clear()
  host = treePage({ withToolbar: true })
  client = fakeClient(SAMPLE)
  dialogs = fakeDialogs()
  opened = []
  typed = 'typed-name.md'
})
describe('revealing the open document', () => {
  it('reopens the ancestors a deliberate collapse closed', async () => {
    await start('/doc/journal/entry.md')
    rowFor('journal').click()

    press('#reveal-document')

    expect([...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)].map((row) => row.dataset.path)).toContain(
      'journal/entry.md',
    )
  })

  it('selects the open document again', async () => {
    await start('/doc/journal/entry.md')
    rowFor('notes.md').click()

    press('#reveal-document')

    expect(rowFor('journal/entry.md').getAttribute('aria-selected')).toBe('true')
  })
})

describe('revealing a document that has moved since the page loaded', () => {
  it('goes to where it is now, not to where it was when the tree mounted', async () => {
    await start('/doc/journal/entry.md')
    openDocumentIn(host).commit('notes.md')

    press('#reveal-document')

    expect(rowFor('notes.md').getAttribute('aria-selected')).toBe('true')
  })

  it('expands the ancestors of the new path rather than the old one', async () => {
    await start('/doc/notes.md')
    openDocumentIn(host).commit('journal/entry.md')
    rowFor('journal').click()

    press('#reveal-document')

    expect([...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)].map((row) => row.dataset.path)).toContain(
      'journal/entry.md',
    )
  })
})
