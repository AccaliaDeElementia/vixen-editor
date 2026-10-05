'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { initFileTree } from '../../../../src/client/files/index.ts'
import { readOpenFolders } from '../../../../src/client/files/open-folders.ts'
import { requestReveal } from '../../../../src/client/reveal-request.ts'
import { announceStoreChanged } from '../../../../src/client/store-changed.ts'
import { parseTree } from '../../../../src/client/files/tree-model.ts'
import { TRASH_PATH } from '../../../../src/client/files/tree-view.ts'
import type { FilesClient } from '../../../../src/client/files/files-client.ts'
import { joinPath } from '../../../../src/shared/store-path.ts'
import { cast } from '../../../cast.ts'
import { given } from '../../../conditions.ts'
import { TRASHED, fakeClient, mountTree, rowFor, rows, treePage } from '../../tree-fixtures.ts'

const SAMPLE = parseTree({
  tree: [
    {
      name: 'journal',
      path: 'journal',
      kind: 'folder',
      children: [
        {
          name: '2026',
          path: 'journal/2026',
          kind: 'folder',
          children: [{ name: 'september.md', path: 'journal/2026/september.md', kind: 'document' }],
        },
        { name: 'entry.md', path: 'journal/entry.md', kind: 'document' },
      ],
    },
    { name: 'notes.md', path: 'notes.md', kind: 'document' },
  ],
})

let host: HTMLElement = document.createElement('div')

async function start(pathname = '/doc/', client = fakeClient(SAMPLE)): Promise<void> {
  await mountTree({ root: host, pathname, client: cast<FilesClient>(client) })
}

function paths(): Array<string | undefined> {
  return rows().map((element) => element.dataset.path)
}

function press(entryPath: string, key: string): void {
  const row = rowFor(entryPath)

  row.focus()
  row.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
}

beforeEach(() => {
  localStorage.clear()
  host = treePage()
})

describe('loading', () => {
  it('renders the tree it fetched', async () => {
    await start()

    expect(paths()).toStrictEqual(['journal', 'notes.md', TRASH_PATH])
  })

  it('opens collapsed', async () => {
    await start()
    given(() => {
      expect(paths()).toContain('journal')
    })

    expect(paths()).not.toContain('journal/entry.md')
  })

  it('does nothing when the page has no tree to fill', async () => {
    document.body.innerHTML = '<p>no explorer here</p>'

    await expect(start()).resolves.toBeUndefined()
  })

  it.each(['Could not load the file browser', 'network down'])(
    'reports a failure saying %s, instead of leaving the panel blank and silent',
    async (fragment) => {
      const client = fakeClient(SAMPLE)
      client.tree.mockRejectedValue(new Error('network down'))

      await start('/doc/', client)

      expect(document.body.textContent).toContain(fragment)
    },
  )

  it('takes its own message back down when the browser is torn down', async () => {
    const client = fakeClient(SAMPLE)
    client.tree.mockRejectedValue(new Error('network down'))
    const { teardownFileTree } = await initFileTree({ root: host, client: cast<FilesClient>(client) })
    given(() => {
      expect(document.body.textContent).toContain('network down')
    })

    teardownFileTree()

    expect(document.body.textContent).not.toContain('network down')
  })

  it('reports a failure that is not an Error at all', async () => {
    const client = fakeClient(SAMPLE)
    client.tree.mockRejectedValue('just a string')

    await start('/doc/', client)

    expect(document.body.textContent).toContain('unknown error')
  })
})

describe('defaults', () => {
  it('reads the live document, location and api when given no options', async () => {
    // A fresh Response per call: one instance cannot be read twice, and the
    // tree and the trash are fetched separately.
    const fetchMock = vi.fn(
      () =>
        new Response(JSON.stringify({ tree: [{ name: 'a.md', path: 'a.md', kind: 'document' }], entries: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await mountTree()

    expect(paths()).toStrictEqual(['a.md', TRASH_PATH])
    vi.unstubAllGlobals()
  })
})

describe('revealing the open document', () => {
  it('expands the ancestors of the document in the url', async () => {
    await start('/doc/journal/2026/september.md')

    expect(paths()).toContain('journal/2026/september.md')
  })

  it('marks the open document as selected', async () => {
    await start('/doc/notes.md')

    expect(rowFor('notes.md').getAttribute('aria-selected')).toBe('true')
  })

  it('leaves unrelated folders closed', async () => {
    await start('/doc/journal/entry.md')

    expect(paths()).not.toContain('journal/2026/september.md')
  })

  it('persists the revealed ancestors, so a reload keeps them open', async () => {
    await start('/doc/journal/2026/september.md')

    expect([...readOpenFolders()]).toContain('journal/2026')
  })

  it('does not persist an ancestor the tree does not have, so a stale url cannot accumulate', async () => {
    await start('/doc/ghost/vanished.md')

    expect([...readOpenFolders()]).not.toContain('ghost')
  })
})

describe('remembering open folders', () => {
  it('restores what was open last time', async () => {
    await start()
    rowFor('journal').click()

    host = treePage()
    await start()

    expect(paths()).toContain('journal/entry.md')
  })

  it('drops a remembered folder the tree no longer has', async () => {
    await start()
    rowFor('journal').click()

    host = treePage()
    await start('/doc/', fakeClient(parseTree({ tree: [] })))

    expect([...readOpenFolders()]).not.toContain('journal')
  })

  it('keeps the trash open across a reload', async () => {
    await start()
    rowFor(TRASH_PATH).click()

    host = treePage()
    await start()

    expect([...readOpenFolders()]).toContain(TRASH_PATH)
  })
})

describe('clicking', () => {
  it('expands a closed folder', async () => {
    await start()

    rowFor('journal').click()

    expect(paths()).toContain('journal/entry.md')
  })

  it('collapses an open folder, doing exactly what the chevron says', async () => {
    await start()
    rowFor('journal').click()

    rowFor('journal').click()

    expect(paths()).not.toContain('journal/entry.md')
  })

  it('collapses an ancestor of the open document, rather than refusing', async () => {
    await start('/doc/journal/2026/september.md')

    rowFor('journal').click()

    expect(paths()).not.toContain('journal/2026/september.md')
  })

  it('selects a document rather than opening it, because a misclick is cheap and an open is not', async () => {
    await start()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })

    rowFor('notes.md').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores a click that did not land on a row', async () => {
    await start()
    const event = new MouseEvent('click', { bubbles: true, cancelable: true })

    document.querySelector('#file-tree')?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('opens the trash to show what is in it', async () => {
    await start('/doc/', fakeClient(SAMPLE, [TRASHED]))

    rowFor(TRASH_PATH).click()

    expect(document.querySelectorAll('[role="treeitem"][data-trash-id]')).toHaveLength(1)
  })
})

describe('keyboard navigation', () => {
  it('moves down with the down arrow', async () => {
    await start()

    press('journal', 'ArrowDown')

    expect(document.activeElement).toBe(rowFor('notes.md'))
  })

  it('moves up with the up arrow', async () => {
    await start()

    press('notes.md', 'ArrowUp')

    expect(document.activeElement).toBe(rowFor('journal'))
  })

  it('stays put at the end of the tree rather than wrapping to the top', async () => {
    await start()

    press(TRASH_PATH, 'ArrowDown')

    expect(document.activeElement).toBe(rowFor(TRASH_PATH))
  })

  it('stays put at the top of the tree rather than wrapping to the bottom', async () => {
    await start()

    press('journal', 'ArrowUp')

    expect(document.activeElement).toBe(rowFor('journal'))
  })

  it('expands a closed folder with the right arrow', async () => {
    await start()

    press('journal', 'ArrowRight')

    expect(paths()).toContain('journal/entry.md')
  })

  it('moves into an open folder with the right arrow', async () => {
    await start()
    press('journal', 'ArrowRight')

    press('journal', 'ArrowRight')

    expect(document.activeElement).toBe(rowFor('journal/2026'))
  })

  it('does nothing on the right arrow at a document', async () => {
    await start()

    press('notes.md', 'ArrowRight')

    expect(document.activeElement).not.toBe(rowFor(TRASH_PATH))
  })

  it('collapses an open folder with the left arrow', async () => {
    await start()
    press('journal', 'ArrowRight')

    press('journal', 'ArrowLeft')

    expect(paths()).not.toContain('journal/entry.md')
  })

  it('moves to the parent with the left arrow on a closed child', async () => {
    await start()
    press('journal', 'ArrowRight')

    press('journal/2026', 'ArrowLeft')

    expect(document.activeElement).toBe(rowFor('journal'))
  })

  it('moves to the parent with the left arrow on a document', async () => {
    await start()
    press('journal', 'ArrowRight')

    press('journal/entry.md', 'ArrowLeft')

    expect(document.activeElement).toBe(rowFor('journal'))
  })

  it('does nothing on the left arrow at the top level', async () => {
    await start()

    press('notes.md', 'ArrowLeft')

    expect(paths()).toStrictEqual(['journal', 'notes.md', TRASH_PATH])
  })

  it('toggles a folder with Enter', async () => {
    await start()

    press('journal', 'Enter')

    expect(paths()).toContain('journal/entry.md')
  })

  it('opens a document on Enter, which is the keyboard equivalent of a double click', async () => {
    await start()
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })

    rowFor('notes.md').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
  })

  it('ignores a key it does not handle', async () => {
    await start()
    const event = new KeyboardEvent('keydown', { key: 'x', bubbles: true, cancelable: true })

    rowFor('journal').dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('ignores a keypress that did not come from a row', async () => {
    await start()
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })

    document.querySelector('#file-tree')?.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(false)
  })

  it('keeps exactly one tab stop after moving', async () => {
    await start()

    press('journal', 'ArrowDown')

    expect(rows().filter((element) => element.getAttribute('tabindex') === '0')).toHaveLength(1)
  })

  it('returns focus to the folder it just toggled', async () => {
    await start()

    press('journal', 'Enter')

    expect(document.activeElement).toBe(rowFor('journal'))
  })
})

describe('markup with no tree to render', () => {
  it('declines rather than throwing, the way the dialog does', async () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    const settled = await mountTree({ root: bare, client: cast<FilesClient>(fakeClient(SAMPLE)) })

    await expect(settled()).resolves.toBeUndefined()
  })

  it('asks the server for nothing, because there is nowhere to put the answer', async () => {
    const bare = document.createElement('div')
    document.body.append(bare)
    const client = fakeClient(SAMPLE)

    await mountTree({ root: bare, client: cast<FilesClient>(client) })

    expect(client.tree).not.toHaveBeenCalled()
  })
})

describe('something else changing the store', () => {
  it('redraws the tree, so a restore elsewhere does not leave it stale', async () => {
    const client = fakeClient(SAMPLE)
    const settled = await mountTree({ root: host, pathname: '/doc/', client: cast<FilesClient>(client) })
    given(() => {
      expect(client.tree).toHaveBeenCalledTimes(1)
    })

    announceStoreChanged(host)
    await settled()

    expect(client.tree).toHaveBeenCalledTimes(2)
  })
})

describe('being asked to show an entry', () => {
  it('opens the trash so a deleted entry can be seen', async () => {
    await mountTree({ root: host, pathname: '/doc/', client: cast<FilesClient>(fakeClient(SAMPLE, [TRASHED])) })
    given(() => {
      expect(rowFor(TRASH_PATH).getAttribute('aria-expanded')).toBe('false')
    })

    requestReveal(host, joinPath(TRASH_PATH, TRASHED.id))

    expect(rowFor(TRASH_PATH).getAttribute('aria-expanded')).toBe('true')
  })

  it('selects the entry, so it is obvious which one is meant', async () => {
    await mountTree({ root: host, pathname: '/doc/', client: cast<FilesClient>(fakeClient(SAMPLE, [TRASHED])) })

    requestReveal(host, joinPath(TRASH_PATH, TRASHED.id))

    expect(rowFor(joinPath(TRASH_PATH, TRASHED.id)).getAttribute('aria-selected')).toBe('true')
  })

  it('leaves the keyboard where it was, since the reader did not ask for it', async () => {
    await mountTree({ root: host, pathname: '/doc/', client: cast<FilesClient>(fakeClient(SAMPLE, [TRASHED])) })
    const elsewhere = document.createElement('button')
    document.body.append(elsewhere)
    elsewhere.focus()

    requestReveal(host, joinPath(TRASH_PATH, TRASHED.id))

    expect(document.activeElement).toBe(elsewhere)
  })
})
