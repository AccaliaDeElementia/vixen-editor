'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestOnly } from '../../src/client/files/actions.ts'
import { FilesRequestError } from '../../src/client/files/files-client.ts'
import { initFileTree } from '../../src/client/files/index.ts'
import { openDocumentIn } from '../../src/client/navigation.ts'
import { parseTree, type TrashNode } from '../../src/client/files/tree-model.ts'
import { ROW_SELECTOR, TRASH_PATH } from '../../src/client/files/tree-view.ts'
import type { Dialogs } from '../../src/client/files/dialogs.ts'
import type { FilesClient } from '../../src/client/files/files-client.ts'
import { cast } from '../cast.ts'

const { trashActionOf } = TestOnly

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

const TRASHED: TrashNode = {
  id: 'aaaa',
  originalPath: 'gone.md',
  kind: 'document',
  deletedAt: '2026-01-01T00:00:00.000Z',
}

let host: HTMLElement = document.createElement('div')

function page(): HTMLElement {
  document.body.innerHTML = ''
  const created = document.createElement('div')
  created.innerHTML = `
    <aside id="explorer">
      <div id="toolbar">
        <button id="new-document"></button>
        <button id="new-folder"></button>
        <button id="upload-file"></button>
        <a id="download-archive" href="/api/files/archive"></a>
        <button id="delete-entry"></button>
        <button id="reveal-document"></button>
        <input id="upload-input" type="file">
      </div>
      <ul id="file-tree" role="tree"></ul>
    </aside>
    <div id="status"></div>`
  document.body.append(created)

  return created
}

interface FakeClient {
  tree: ReturnType<typeof vi.fn>
  trash: ReturnType<typeof vi.fn>
  createDocument: ReturnType<typeof vi.fn>
  createFolder: ReturnType<typeof vi.fn>
  upload: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  purge: ReturnType<typeof vi.fn>
}

function fakeClient(trash: TrashNode[] = []): FakeClient {
  return {
    tree: vi.fn().mockResolvedValue(SAMPLE),
    trash: vi.fn().mockResolvedValue(trash),
    createDocument: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue('uploaded.png'),
    remove: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn().mockResolvedValue(undefined),
  }
}

function fakeDialogs(): { prompt: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> } {
  return {
    prompt: vi.fn(async (request: { submit: (value: string) => Promise<string | null> }) => {
      await request.submit('typed-name.md')
      return true
    }),
    confirm: vi.fn().mockResolvedValue(true),
  }
}

let client: ReturnType<typeof fakeClient> = fakeClient()
let dialogs: ReturnType<typeof fakeDialogs> = fakeDialogs()

async function start(pathname = '/doc/'): Promise<void> {
  await initFileTree({ root: host, pathname, client: cast<FilesClient>(client), dialogs: cast<Dialogs>(dialogs) })
}

function rowFor(entryPath: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)].find(
    (element) => element.dataset.path === entryPath,
  )
  if (found === undefined) throw new Error(`no row for ${entryPath}`)
  return found
}

function press(selector: string): void {
  document.querySelector<HTMLElement>(selector)?.click()
}

function statusText(): string {
  return [...document.querySelectorAll('#status .toast')].at(-1)?.textContent ?? ''
}

beforeEach(() => {
  localStorage.clear()
  host = page()
  client = fakeClient()
  dialogs = fakeDialogs()
})

describe('where a new entry lands', () => {
  it('goes to the store root when nothing is selected', async () => {
    await start()
    rowFor('notes.md').click()
    rowFor('notes.md').click()
    press('#new-document')
    await vi.waitFor(() => {
      expect(client.createDocument).toHaveBeenCalled()
    })

    expect(client.createDocument).toHaveBeenCalledWith('typed-name.md')
  })

  it('goes inside a selected folder', async () => {
    await start()
    rowFor('journal').click()

    press('#new-document')
    await vi.waitFor(() => {
      expect(client.createDocument).toHaveBeenCalled()
    })

    expect(client.createDocument).toHaveBeenCalledWith('journal/typed-name.md')
  })

  it('goes beside a selected file, not inside it', async () => {
    await start()
    rowFor('journal').click()
    rowFor('journal/entry.md').click()

    press('#new-folder')
    await vi.waitFor(() => {
      expect(client.createFolder).toHaveBeenCalled()
    })

    expect(client.createFolder).toHaveBeenCalledWith('journal/typed-name.md')
  })

  it('follows the open document when nothing has been clicked', async () => {
    await start('/doc/journal/entry.md')

    press('#new-document')
    await vi.waitFor(() => {
      expect(client.createDocument).toHaveBeenCalled()
    })

    expect(client.createDocument).toHaveBeenCalledWith('journal/typed-name.md')
  })
})

describe('creating', () => {
  it('refreshes the tree afterwards, so the new entry appears', async () => {
    await start()

    press('#new-folder')
    await vi.waitFor(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })
  })

  it('keeps a rejected name in the dialog rather than throwing it away', async () => {
    client.createDocument.mockRejectedValue(new FilesRequestError(409, 'Already exists', 'ALREADY_EXISTS', []))
    await start()

    press('#new-document')

    await vi.waitFor(() => {
      expect(dialogs.prompt).toHaveBeenCalled()
    })
    await expect(dialogs.prompt.mock.results[0]?.value).resolves.toBe(true)
  })

  it('reports a failure the user cannot fix by retyping', async () => {
    client.createDocument.mockRejectedValue(new FilesRequestError(503, 'Busy, try again', 'BUSY', []))
    await start()

    press('#new-document')

    await vi.waitFor(() => {
      expect(statusText()).toContain('Busy, try again')
    })
  })
})

describe('deleting', () => {
  it('asks before moving the selection to the trash', async () => {
    await start()
    rowFor('notes.md').click()

    press('#delete-entry')

    await vi.waitFor(() => {
      expect(client.remove).toHaveBeenCalledWith('notes.md')
    })
    expect(dialogs.confirm).toHaveBeenCalled()
  })

  it('does nothing when the confirmation is declined', async () => {
    dialogs.confirm.mockResolvedValue(false)
    await start()
    rowFor('notes.md').click()

    press('#delete-entry')
    await vi.waitFor(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })

    expect(client.remove).not.toHaveBeenCalled()
  })

  it('says so when the url names a document the tree does not hold', async () => {
    await start('/doc/never-created.md')

    press('#delete-entry')

    expect(client.remove).not.toHaveBeenCalled()
    expect(statusText()).toContain('Select something to delete first')
  })
})

describe('uploading', () => {
  it('sends each dropped file to the selected directory', async () => {
    await start()
    rowFor('journal').click()
    const input = document.querySelector<HTMLInputElement>('#upload-input')
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.png'), new File(['y'], 'b.png')] })

    input?.dispatchEvent(new Event('change'))

    await vi.waitFor(() => {
      expect(client.upload).toHaveBeenCalledTimes(2)
    })
    expect(client.upload).toHaveBeenCalledWith('journal', expect.objectContaining({ name: 'a.png' }))
  })

  it('reports one rejected file without discarding the rest', async () => {
    await start()
    client.upload.mockRejectedValueOnce(new Error('too large')).mockResolvedValueOnce('b.png')
    const input = document.querySelector<HTMLInputElement>('#upload-input')
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'a.png'), new File(['y'], 'b.png')] })

    input?.dispatchEvent(new Event('change'))

    await vi.waitFor(() => {
      expect(client.upload).toHaveBeenCalledTimes(2)
    })
    expect(statusText()).toContain('a.png')
  })

  it('opens the file picker when the toolbar button is pressed', async () => {
    await start()
    const input = document.querySelector<HTMLInputElement>('#upload-input')
    const opened = vi.fn()
    input?.addEventListener('click', () => {
      opened()
    })

    press('#upload-file')

    expect(opened).toHaveBeenCalled()
  })
})

describe('the archive link', () => {
  it('downloads the whole store when nothing is selected', async () => {
    await start()

    expect(document.querySelector('#download-archive')?.getAttribute('href')).toBe('/api/files/archive')
  })

  it('downloads the selected folder', async () => {
    await start()

    rowFor('journal').click()

    expect(document.querySelector('#download-archive')?.getAttribute('href')).toBe('/api/files/archive?path=journal')
  })
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

describe('trash actions', () => {
  beforeEach(() => {
    client = fakeClient([TRASHED])
  })

  it('restores an entry', async () => {
    await start()
    rowFor(TRASH_PATH).click()

    document.querySelector<HTMLElement>('[data-action="restore"]')?.click()

    await vi.waitFor(() => {
      expect(client.restore).toHaveBeenCalledWith('aaaa')
    })
  })

  it('asks before purging, because that cannot be undone', async () => {
    await start()
    rowFor(TRASH_PATH).click()

    document.querySelector<HTMLElement>('[data-action="purge"]')?.click()

    await vi.waitFor(() => {
      expect(client.purge).toHaveBeenCalledWith('aaaa')
    })
    expect(dialogs.confirm).toHaveBeenCalled()
  })

  it('leaves the entry alone when the purge is declined', async () => {
    dialogs.confirm.mockResolvedValue(false)
    await start()
    rowFor(TRASH_PATH).click()

    document.querySelector<HTMLElement>('[data-action="purge"]')?.click()
    await vi.waitFor(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })

    expect(client.purge).not.toHaveBeenCalled()
  })

  it('does not toggle the trash open state when an action is pressed', async () => {
    await start()
    rowFor(TRASH_PATH).click()

    document.querySelector<HTMLElement>('[data-action="restore"]')?.click()

    expect(document.querySelectorAll('[role="treeitem"][data-trash-id]').length).toBeGreaterThan(0)
  })

  it('reports a failed restore', async () => {
    client.restore.mockRejectedValue(new FilesRequestError(409, 'Already exists', 'ALREADY_EXISTS', []))
    await start()
    rowFor(TRASH_PATH).click()

    document.querySelector<HTMLElement>('[data-action="restore"]')?.click()

    await vi.waitFor(() => {
      expect(statusText()).toContain('Already exists')
    })
  })
})

describe('trashActionOf', () => {
  it('reads the action and the entry from a button', () => {
    document.body.innerHTML = '<button data-action="purge" data-trash-id="abc"></button>'

    expect(trashActionOf(document.querySelector('button'))).toStrictEqual({ action: 'purge', trashId: 'abc' })
  })

  it('finds the button when the event came from something inside it', () => {
    document.body.innerHTML = '<button data-action="restore" data-trash-id="abc"><span></span></button>'

    expect(trashActionOf(document.querySelector('span'))).toMatchObject({ action: 'restore' })
  })

  it('reports nothing for an element that is not an action', () => {
    document.body.innerHTML = '<div id="plain"></div>'

    expect(trashActionOf(document.querySelector('#plain'))).toBeNull()
  })

  it('reports nothing for an action button carrying no entry', () => {
    document.body.innerHTML = '<button data-action="purge"></button>'

    expect(trashActionOf(document.querySelector('button'))).toBeNull()
  })

  it('reports nothing for a target that is not an element at all', () => {
    expect(trashActionOf(new EventTarget())).toBeNull()
  })

  it('reports nothing for no target', () => {
    expect(trashActionOf(null)).toBeNull()
  })
})

describe('reporting odd failures', () => {
  it('describes a rejection that is not an Error', async () => {
    client.remove.mockRejectedValue('just a string')
    await start()
    rowFor('notes.md').click()

    press('#delete-entry')

    await vi.waitFor(() => {
      expect(statusText()).toContain('unknown error')
    })
  })

  it('uploads nothing when the picker was dismissed without choosing a file', async () => {
    await start()
    const input = document.querySelector<HTMLInputElement>('#upload-input')
    Object.defineProperty(input, 'files', { value: null })

    input?.dispatchEvent(new Event('change'))

    await vi.waitFor(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })
    expect(client.upload).not.toHaveBeenCalled()
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
