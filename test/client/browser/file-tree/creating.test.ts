'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { parseTree, type TreeNode } from '../../../../src/client/browser/tree/tree-model.ts'
import type { Dialogs } from '../../../../src/client/platform/dialogs.ts'
import type { FilesClient } from '../../../../src/client/browser/files-client.ts'
import { cast } from '../../../cast.ts'
import { given } from '../../../conditions.ts'
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

let settled: () => Promise<void> = () => Promise.resolve()
let opened: string[] = []

async function start(pathname = '/doc/'): Promise<void> {
  settled = await mountTree({
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
const CREATED_DOCUMENT: readonly TreeNode[] = [
  ...SAMPLE,
  ...parseTree({ tree: [{ name: 'typed-name.md', path: 'typed-name.md', kind: 'document' }] }),
]

const CREATED_FOLDER: readonly TreeNode[] = [
  ...SAMPLE,
  ...parseTree({
    tree: [
      {
        name: 'typed-name.md',
        path: 'typed-name.md',
        kind: 'folder',
        children: [{ name: 'index.md', path: 'typed-name.md/index.md', kind: 'document' }],
      },
    ],
  }),
]

const CREATED_IN_JOURNAL: readonly TreeNode[] = parseTree({
  tree: [
    {
      name: 'journal',
      path: 'journal',
      kind: 'folder',
      children: [
        { name: 'entry.md', path: 'journal/entry.md', kind: 'document' },
        { name: 'typed-name.md', path: 'journal/typed-name.md', kind: 'document' },
      ],
    },
    { name: 'notes.md', path: 'notes.md', kind: 'document' },
  ],
})

describe('a new entry opens once it exists', () => {
  function appearsAs(nodes: readonly TreeNode[]): void {
    client.tree.mockResolvedValueOnce(SAMPLE).mockResolvedValue(nodes)
  }

  it('opens a new document, so the user lands in the thing they just made', async () => {
    appearsAs(CREATED_DOCUMENT)
    await start()

    press('#new-document')
    await settled()

    expect(opened).toStrictEqual(['/doc/typed-name.md'])
  })

  it('selects a new document, so the next entry lands beside it', async () => {
    appearsAs(CREATED_DOCUMENT)
    await start()

    press('#new-document')
    await settled()

    expect(rowFor('typed-name.md').getAttribute('aria-selected')).toBe('true')
  })

  it('expands a new folder, which is what opening a folder means here', async () => {
    appearsAs(CREATED_FOLDER)
    await start()

    press('#new-folder')
    await settled()

    expect(rowFor('typed-name.md').getAttribute('aria-expanded')).toBe('true')
  })

  it('selects a new folder, so the next entry lands inside it', async () => {
    appearsAs(CREATED_FOLDER)
    await start()

    press('#new-folder')
    await settled()

    expect(rowFor('typed-name.md').getAttribute('aria-selected')).toBe('true')
  })

  it('leaves the open document where it is when a folder is created', async () => {
    appearsAs(CREATED_FOLDER)
    await start()

    press('#new-folder')
    await settled()

    expect(opened).toStrictEqual([])
  })

  it('opens nothing when the dialog is cancelled, because nothing was made', async () => {
    appearsAs(CREATED_DOCUMENT)
    dialogs.prompt.mockResolvedValue(false)
    await start()

    press('#new-document')
    await settled()

    expect(opened).toStrictEqual([])
  })

  it('expands a collapsed folder it was created inside, or nothing would show', async () => {
    appearsAs(CREATED_IN_JOURNAL)
    await start()
    rowFor('journal').click()
    rowFor('journal').click()
    given(() => {
      expect(rowFor('journal').getAttribute('aria-expanded')).toBe('false')
    })

    press('#new-document')
    await settled()

    expect(rowFor('journal').getAttribute('aria-expanded')).toBe('true')
  })
})
