'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { onInsertRequested } from '../../../../src/client/insert-entry.ts'
import { onKeepRequested } from '../../../../src/client/keep-request.ts'
import { joinPath } from '../../../../src/shared/store-path.ts'
import { TRASH_PATH } from '../../../../src/client/files/tree-view.ts'
import type { FilesClient } from '../../../../src/client/files/files-client.ts'

import { cast } from '../../../cast.ts'
import { TRASHED, fakeClient, mountTree, rowFor, statusText, treePage } from '../../tree-fixtures.ts'

const SAMPLE = [
  { name: 'journal', path: 'journal', kind: 'folder' as const, children: [] },
  { name: 'notes.md', path: 'notes.md', kind: 'document' as const },
  { name: 'photo.png', path: 'photo.png', kind: 'image' as const },
]

let host: HTMLElement = document.createElement('div')
let opened: string[] = []

async function start(pathname = '/doc/'): Promise<void> {
  await mountTree({
    root: host,
    pathname,
    client: cast<FilesClient>(fakeClient(SAMPLE, [TRASHED])),
    navigate: (url: string) => {
      opened.push(url)
    },
  })
}

function click(entryPath: string, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, ...init })
  rowFor(entryPath).dispatchEvent(event)

  return event
}

function doubleClick(entryPath: string): void {
  rowFor(entryPath).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
}

function selectedPaths(): Array<string | undefined> {
  return [...document.querySelectorAll<HTMLElement>('[aria-selected="true"]')].map((row) => row.dataset.path)
}

beforeEach(() => {
  localStorage.clear()
  opened = []
  host = treePage({ withOpenSelected: true })
})

describe('a plain click', () => {
  it('opens a document and selects it, which is one act rather than two', async () => {
    await start()

    click('notes.md')

    expect({ opened, selected: selectedPaths() }).toStrictEqual({
      opened: ['/doc/notes.md'],
      selected: ['notes.md'],
    })
  })

  it('opens an image on the same terms', async () => {
    await start()

    click('photo.png')

    expect({ opened, selected: selectedPaths() }).toStrictEqual({
      opened: ['/doc/photo.png'],
      selected: ['photo.png'],
    })
  })

  it('selects a folder without opening it, so the toolbar can be aimed without leaving', async () => {
    await start()

    click('journal')

    expect({ opened, selected: selectedPaths() }).toStrictEqual({ opened: [], selected: ['journal'] })
  })

  it('moves the selection rather than adding to it', async () => {
    await start()

    click('notes.md')
    click('photo.png')

    expect(selectedPaths()).toStrictEqual(['photo.png'])
  })
})

describe('a double click', () => {
  function keepRequests(): string[] {
    const asked: string[] = []
    onKeepRequested(host, (entryPath) => {
      asked.push(entryPath)
    })

    return asked
  }

  it('asks for the document to be kept, rather than opening it a second time', async () => {
    await start()
    const asked = keepRequests()
    click('notes.md')

    doubleClick('notes.md')

    expect({ asked, opened }).toStrictEqual({ asked: ['notes.md'], opened: ['/doc/notes.md'] })
  })

  it('asks the same for an image, which is a tab like any other', async () => {
    await start()
    const asked = keepRequests()

    doubleClick('photo.png')

    expect(asked).toStrictEqual(['photo.png'])
  })

  it('opens a folder’s index, which a single click deliberately does not', async () => {
    await start()

    doubleClick('journal')

    expect(opened).toStrictEqual(['/doc/journal/'])
  })

  it('opens no index for a row that is not in the store', async () => {
    await start()

    doubleClick(TRASH_PATH)

    expect(opened).toStrictEqual([])
  })

  it('ignores a double click that did not land on a row', async () => {
    await start()

    host.querySelector('#file-tree')?.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))

    expect(opened).toStrictEqual([])
  })
})

describe('a click the browser should handle', () => {
  it.each([
    ['ctrl, which opens a tab', { ctrlKey: true }],
    ['cmd, which opens a tab on a mac', { metaKey: true }],
    ['shift, which opens a window', { shiftKey: true }],
    ['alt, which downloads', { altKey: true }],
  ])('leaves a click with %s alone', async (_case, init) => {
    await start()

    expect(click('notes.md', init).defaultPrevented).toBe(false)
  })

  it('does not navigate in this tab either, because the browser is doing it', async () => {
    await start()

    click('notes.md', { ctrlKey: true })

    expect(opened).toStrictEqual([])
  })
})

describe('Enter', () => {
  function press(entryPath: string): void {
    rowFor(entryPath).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
  }

  it('opens a document, the keyboard equivalent of a single click', async () => {
    await start()

    press('notes.md')

    expect(opened).toStrictEqual(['/doc/notes.md'])
  })

  it('toggles a folder rather than opening anything', async () => {
    await start()

    press('journal')

    expect(opened).toStrictEqual([])
  })
})

describe('inserting the selection with the keyboard', () => {
  function press(entryPath: string, init: KeyboardEventInit): boolean {
    const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
    rowFor(entryPath).dispatchEvent(event)

    return event.defaultPrevented
  }

  function requested(): string[] {
    const heard: string[] = []
    onInsertRequested(host, (entryPath) => {
      heard.push(entryPath)
    })

    return heard
  }

  it('asks for a link to the selected file', async () => {
    await start()
    const heard = requested()
    click('notes.md')

    press('notes.md', { key: 'i', ctrlKey: true })

    expect(heard).toStrictEqual(['notes.md'])
  })

  it('asks on a mac too', async () => {
    await start()
    const heard = requested()
    click('notes.md')

    press('notes.md', { key: 'i', metaKey: true })

    expect(heard).toStrictEqual(['notes.md'])
  })

  it('says why it did nothing when the trash is what is selected', async () => {
    await start()
    const heard = requested()
    rowFor(TRASH_PATH).click()

    press(TRASH_PATH, { key: 'i', ctrlKey: true })

    expect({ heard, said: statusText() }).toStrictEqual({
      heard: [],
      said: 'Select a file in the browser first, then insert it',
    })
  })

  it('claims the key, so the browser does not act on it as well', async () => {
    await start()
    click('notes.md')

    expect(press('notes.md', { key: 'i', ctrlKey: true })).toBe(true)
  })

  it.each([
    ['i alone, which types a letter', { key: 'i' }],
    ['shift, which is a different gesture', { key: 'i', ctrlKey: true, shiftKey: true }],
    ['alt, which is a different gesture', { key: 'i', ctrlKey: true, altKey: true }],
    ['another key entirely', { key: 'o', ctrlKey: true }],
  ])('leaves %s alone', async (_case, init) => {
    await start()
    const heard = requested()
    click('notes.md')

    press('notes.md', init)

    expect(heard).toStrictEqual([])
  })
})

describe('the Open selected action', () => {
  function pressOpen(): void {
    host.querySelector<HTMLButtonElement>('#open-selected')?.click()
  }

  it('opens whatever a single click selected', async () => {
    await start()
    click('notes.md')
    opened.length = 0

    pressOpen()

    expect(opened).toStrictEqual(['/doc/notes.md'])
  })

  it('opens a trash entry the same way, by its id', async () => {
    await start()
    rowFor(TRASH_PATH).click()
    click(joinPath(TRASH_PATH, TRASHED.id))
    opened.length = 0

    pressOpen()

    expect(opened).toStrictEqual(['/trash/aaaa'])
  })

  it('does nothing for a selected folder, which has nothing to open', async () => {
    await start()
    click('journal')

    pressOpen()

    expect(opened).toStrictEqual([])
  })

  it('does nothing when the selection names no visible row', async () => {
    await start('/doc/absent.md')

    pressOpen()

    expect(opened).toStrictEqual([])
  })
})

describe('moving through the tree with the keyboard', () => {
  function move(entryPath: string, key: string): void {
    rowFor(entryPath).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  }

  it('selects what it lands on, so a file can be aimed at without opening it', async () => {
    await start()
    rowFor('notes.md').focus()

    move('notes.md', 'ArrowDown')

    expect(selectedPaths()).toStrictEqual(['photo.png'])
  })

  it('opens nothing on the way, which is the whole point of moving rather than clicking', async () => {
    await start()
    rowFor('notes.md').focus()

    move('notes.md', 'ArrowDown')

    expect(opened).toStrictEqual([])
  })
})
