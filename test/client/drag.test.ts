'use sanity'

import { given } from '../conditions.ts'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestOnly } from '../../src/client/files/drag.ts'
import { FilesRequestError } from '../../src/client/files/files-client.ts'
import { initFileTree } from '../../src/client/files/index.ts'
import { parseTree } from '../../src/client/files/tree-model.ts'
import { TRASH_PATH, TREE_SELECTOR } from '../../src/client/files/tree-view.ts'
import type { Dialogs } from '../../src/client/files/dialogs.ts'
import type { FilesClient } from '../../src/client/files/files-client.ts'
import { cast } from '../cast.ts'
import { fakeClient, rowFor, rows, TRASHED, treePage, type FakeClient } from './tree-fixtures.ts'

const { DRAG_MIME, DROP_TARGET_CLASS, canMoveInto, containerOf } = TestOnly

const SAMPLE = parseTree({
  tree: [
    {
      name: 'archive',
      path: 'archive',
      kind: 'folder',
      children: [{ name: 'old.md', path: 'archive/old.md', kind: 'document' }],
    },
    {
      name: 'journal',
      path: 'journal',
      kind: 'folder',
      children: [{ name: '2026', path: 'journal/2026', kind: 'folder', children: [] }],
    },
    { name: 'notes.md', path: 'notes.md', kind: 'document' },
    { name: 'photo.png', path: 'photo.png', kind: 'image' },
  ],
})

const TREE_AFTER_MOVE = parseTree({
  tree: [
    {
      name: 'archive',
      path: 'archive',
      kind: 'folder',
      children: [
        { name: 'old.md', path: 'archive/old.md', kind: 'document' },
        { name: 'notes.md', path: 'archive/notes.md', kind: 'document' },
      ],
    },
  ],
})

function fakeDialogs(): { prompt: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> } {
  return { prompt: vi.fn().mockResolvedValue(true), confirm: vi.fn().mockResolvedValue(true) }
}

let client: FakeClient = fakeClient(SAMPLE, [TRASHED])
let dialogs: ReturnType<typeof fakeDialogs> = fakeDialogs()

function actionsTaken(): Record<string, number> {
  return { moves: client.move.mock.calls.length, uploads: client.upload.mock.calls.length }
}

const NOTHING_HAPPENED = { moves: 0, uploads: 0 }

let settled: () => Promise<void> = () => Promise.resolve()

async function start(open: string[] = ['archive', 'journal']): Promise<void> {
  settled = await initFileTree({
    root: document,
    pathname: '/doc/',
    client: cast<FilesClient>(client),
    dialogs: cast<Dialogs>(dialogs),
  })
  for (const folder of open) rowFor(folder).click()
}

function tree(): HTMLElement {
  const element = document.querySelector<HTMLElement>('#file-tree')
  if (element === null) throw new Error('missing tree')
  return element
}

// happy-dom ignores `dataTransfer` in the DragEvent init and leaves the
// property undefined, so it is attached by hand.
function dragEvent(type: string, transfer: DataTransfer): DragEvent {
  const event = new DragEvent(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: transfer })

  return event
}

function internalTransfer(from: string): DataTransfer {
  const transfer = new DataTransfer()
  transfer.setData(DRAG_MIME, from)
  return transfer
}

function externalTransfer(...files: File[]): DataTransfer {
  const transfer = new DataTransfer()
  for (const file of files) transfer.items.add(file)
  return transfer
}

function drag(from: string, onto: HTMLElement, transfer = internalTransfer(from)): DragEvent {
  rowFor(from).dispatchEvent(dragEvent('dragstart', transfer))
  onto.dispatchEvent(dragEvent('dragover', transfer))
  const drop = dragEvent('drop', transfer)
  onto.dispatchEvent(drop)
  return drop
}

function treeElement(): HTMLElement {
  const tree = document.querySelector<HTMLElement>(TREE_SELECTOR)
  if (tree === null) throw new Error('no tree')

  return tree
}

function statusText(): string {
  return [...document.querySelectorAll('#status .toast')].at(-1)?.textContent ?? ''
}

beforeEach(() => {
  localStorage.clear()
  treePage()
  client = fakeClient(SAMPLE, [TRASHED])
  dialogs = fakeDialogs()
})

describe('containerOf', () => {
  it.each([
    [
      'a folder takes drops into itself',
      { path: 'journal', expandable: true, kind: 'folder' as const, opens: null },
      'journal',
    ],
    [
      'a document takes drops beside it',
      { path: 'journal/a.md', expandable: false, kind: 'document' as const, opens: null },
      'journal',
    ],
    [
      'a root document targets the root',
      { path: 'a.md', expandable: false, kind: 'document' as const, opens: null },
      '',
    ],
    ['an image behaves like a document', { path: 'p.png', expandable: false, kind: 'image' as const, opens: null }, ''],
  ])('%s', (_label, row, expected) => {
    expect(containerOf(row)).toBe(expected)
  })

  it('treats the tree background as the store root', () => {
    expect(containerOf(undefined)).toBe('')
  })

  it.each([
    ['the trash pseudo-folder', { path: TRASH_PATH, expandable: true, kind: 'trash-root' as const, opens: null }],
    ['a deleted entry', { path: 'gone.md', expandable: false, kind: 'trash-entry' as const, opens: null }],
  ])('refuses drops onto %s, which is not a place in the store', (_label, row) => {
    expect(containerOf(row)).toBeNull()
  })
})

describe('canMoveInto', () => {
  it.each([
    ['a sibling folder', 'journal', 'archive', true],
    ['the root', 'journal', '', true],
    ['itself', 'journal', 'journal', false],
    ['its own child', 'journal', 'journal/2026', false],
    ['a deeper descendant', 'journal', 'journal/2026/q1', false],
    ['a folder whose name merely starts the same', 'journal', 'journal-archive', true],
  ])('%s', (_label, source, directory, expected) => {
    expect(canMoveInto(source, directory)).toBe(expected)
  })
})

describe('moving by drag', () => {
  it('moves a document into the folder it was dropped on', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(client.move).toHaveBeenCalledWith('notes.md', 'archive/notes.md')
  })

  it('drops beside a document rather than inside it', async () => {
    await start()

    drag('notes.md', rowFor('archive/old.md'))

    await settled()

    expect(client.move).toHaveBeenCalledWith('notes.md', 'archive/notes.md')
  })

  it('moves a whole folder', async () => {
    await start()

    drag('journal', rowFor('archive'))

    await settled()

    expect(client.move).toHaveBeenCalledWith('journal', 'archive/journal')
  })

  it('moves the file into the folder it was dropped on', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(client.move).toHaveBeenCalledWith('notes.md', 'archive/notes.md')
  })

  it('asks nothing, because an occupied destination is simply refused', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await settled()
    given(() => {
      expect(client.move).toHaveBeenCalled()
    })

    expect(dialogs.confirm).not.toHaveBeenCalled()
  })

  it('refreshes the tree after a move', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(client.tree).toHaveBeenCalledTimes(2)
  })

  it('does nothing when dropped back on its own parent', async () => {
    await start()

    drag('archive/old.md', rowFor('archive'))

    await settled()
    given(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })

    expect(client.move).not.toHaveBeenCalled()
  })

  it('reports a move the server refuses for a reason the user cannot fix', async () => {
    client.move.mockRejectedValue(new FilesRequestError(409, 'Cannot move into its own descendant', 'INVALID_MOVE', []))
    await start()

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(statusText()).toContain('Cannot move into its own descendant')
  })
})

describe('showing where the entry went', () => {
  it('opens the destination folder so the moved entry is visible', async () => {
    await start([])
    client.tree.mockResolvedValue(TREE_AFTER_MOVE)

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(rows().map((row) => row.dataset.path)).toContain('archive/notes.md')
  })

  it('selects the entry at its new path', async () => {
    await start([])
    client.tree.mockResolvedValue(TREE_AFTER_MOVE)

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(rowFor('archive/notes.md').getAttribute('aria-selected')).toBe('true')
  })

  it('reveals nothing when the drop was a no-op', async () => {
    await start()
    client.tree.mockResolvedValue(TREE_AFTER_MOVE)

    drag('archive/old.md', rowFor('archive'))

    await settled()
    given(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })

    expect(rows().filter((row) => row.getAttribute('aria-selected') === 'true')).toHaveLength(0)
  })
})

describe('a drag that does not start on a row', () => {
  it('carries nothing, so a later drop has no source to move', async () => {
    await start()
    const tree = document.querySelector('#file-tree')
    const transfer = new DataTransfer()

    tree?.dispatchEvent(dragEvent('dragstart', transfer))

    expect(transfer.getData(DRAG_MIME)).toBe('')
  })
})

describe('where a drop is refused', () => {
  it('offers no affordance for a folder onto its own descendant', async () => {
    await start()
    const transfer = internalTransfer('journal')
    rowFor('journal').dispatchEvent(dragEvent('dragstart', transfer))

    const over = dragEvent('dragover', transfer)
    rowFor('journal/2026').dispatchEvent(over)

    expect(over.defaultPrevented).toBe(false)
  })

  it('marks no row for a folder onto its own descendant', async () => {
    await start()
    const transfer = internalTransfer('journal')
    rowFor('journal').dispatchEvent(dragEvent('dragstart', transfer))

    const over = dragEvent('dragover', transfer)
    rowFor('journal/2026').dispatchEvent(over)

    expect(rowFor('journal/2026').className).not.toContain(DROP_TARGET_CLASS)
  })

  it('marks no row when the drag is over the tree background, which is the root', async () => {
    await start()
    const transfer = internalTransfer('notes.md')
    rowFor('notes.md').dispatchEvent(dragEvent('dragstart', transfer))

    const over = dragEvent('dragover', transfer)
    treeElement().dispatchEvent(over)

    given(() => {
      expect(over.defaultPrevented).toBe(true)
    })

    expect(document.querySelectorAll(`.${DROP_TARGET_CLASS}`)).toHaveLength(0)
  })

  it('offers no affordance onto the trash', async () => {
    await start()
    const transfer = internalTransfer('notes.md')
    rowFor('notes.md').dispatchEvent(dragEvent('dragstart', transfer))

    const over = dragEvent('dragover', transfer)
    rowFor(TRASH_PATH).dispatchEvent(over)

    expect(over.defaultPrevented).toBe(false)
  })

  it('does not move when dropped somewhere illegal', async () => {
    await start()

    drag('journal', rowFor('journal/2026'))

    expect(client.move).not.toHaveBeenCalled()
  })

  it('does not drag the trash pseudo-folder itself', async () => {
    await start()
    const transfer = new DataTransfer()

    rowFor(TRASH_PATH).dispatchEvent(dragEvent('dragstart', transfer))

    expect(transfer.getData(DRAG_MIME)).toBe('')
  })
})

describe('the drop affordance', () => {
  it('marks the row a legal drop would land on', async () => {
    await start()
    const transfer = internalTransfer('notes.md')
    rowFor('notes.md').dispatchEvent(dragEvent('dragstart', transfer))

    rowFor('archive').dispatchEvent(dragEvent('dragover', transfer))

    expect(rowFor('archive').className).toContain(DROP_TARGET_CLASS)
  })

  it('marks only one row at a time', async () => {
    await start()
    const transfer = internalTransfer('notes.md')
    rowFor('notes.md').dispatchEvent(dragEvent('dragstart', transfer))

    rowFor('archive').dispatchEvent(dragEvent('dragover', transfer))
    rowFor('journal').dispatchEvent(dragEvent('dragover', transfer))

    expect(document.querySelectorAll(`.${DROP_TARGET_CLASS}`)).toHaveLength(1)
  })

  it('clears once the drag ends', async () => {
    await start()
    const transfer = internalTransfer('notes.md')
    rowFor('notes.md').dispatchEvent(dragEvent('dragstart', transfer))
    rowFor('archive').dispatchEvent(dragEvent('dragover', transfer))

    tree().dispatchEvent(dragEvent('dragend', transfer))

    expect(document.querySelectorAll(`.${DROP_TARGET_CLASS}`)).toHaveLength(0)
  })

  it('clears when the pointer leaves the tree', async () => {
    await start()
    const transfer = internalTransfer('notes.md')
    rowFor('notes.md').dispatchEvent(dragEvent('dragstart', transfer))
    rowFor('archive').dispatchEvent(dragEvent('dragover', transfer))

    tree().dispatchEvent(dragEvent('dragleave', transfer))

    expect(document.querySelectorAll(`.${DROP_TARGET_CLASS}`)).toHaveLength(0)
  })

  it('leaves the mark alone when the pointer merely crosses a row', async () => {
    await start()
    const transfer = internalTransfer('notes.md')
    rowFor('notes.md').dispatchEvent(dragEvent('dragstart', transfer))
    rowFor('archive').dispatchEvent(dragEvent('dragover', transfer))

    rowFor('archive').dispatchEvent(dragEvent('dragleave', transfer))

    expect(document.querySelectorAll(`.${DROP_TARGET_CLASS}`)).toHaveLength(1)
  })

  it('clears the mark once dropped', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    expect(document.querySelectorAll(`.${DROP_TARGET_CLASS}`)).toHaveLength(0)
  })
})

describe('dropping files from outside', () => {
  it('uploads into the folder dropped on', async () => {
    await start()
    const transfer = externalTransfer(new File(['x'], 'a.png'))

    rowFor('archive').dispatchEvent(dragEvent('dragover', transfer))
    rowFor('archive').dispatchEvent(dragEvent('drop', transfer))

    await settled()

    expect(client.upload).toHaveBeenCalledWith('archive', expect.objectContaining({ name: 'a.png' }))
  })

  it('uploads into the root when dropped on the tree background', async () => {
    await start()
    const transfer = externalTransfer(new File(['x'], 'a.png'))

    tree().dispatchEvent(dragEvent('drop', transfer))

    await settled()

    expect(client.upload).toHaveBeenCalledWith('', expect.objectContaining({ name: 'a.png' }))
  })

  it('takes the drop position over the selection', async () => {
    await start()
    rowFor('notes.md').click()
    const transfer = externalTransfer(new File(['x'], 'a.png'))

    rowFor('archive').dispatchEvent(dragEvent('drop', transfer))

    await settled()

    expect(client.upload).toHaveBeenCalledWith('archive', expect.anything())
  })

  it('sends each file separately, so one rejection does not discard the rest', async () => {
    await start()
    client.upload.mockRejectedValueOnce(new Error('too large')).mockResolvedValueOnce('b.png')
    const transfer = externalTransfer(new File(['x'], 'a.png'), new File(['y'], 'b.png'))

    rowFor('archive').dispatchEvent(dragEvent('drop', transfer))

    await settled()

    expect(client.upload).toHaveBeenCalledTimes(2)
  })

  it('reports the file that was rejected, so the failure is not silent', async () => {
    await start()
    client.upload.mockRejectedValueOnce(new Error('too large')).mockResolvedValueOnce('b.png')
    const transfer = externalTransfer(new File(['x'], 'a.png'), new File(['y'], 'b.png'))

    rowFor('archive').dispatchEvent(dragEvent('drop', transfer))

    await settled()
    given(() => {
      expect(client.upload).toHaveBeenCalledTimes(2)
    })

    expect(statusText()).toContain('a.png')
  })

  it('prevents the browser navigating away to the dropped file', async () => {
    await start()
    const transfer = externalTransfer(new File(['x'], 'a.png'))

    const over = dragEvent('dragover', transfer)
    rowFor('archive').dispatchEvent(over)

    expect(over.defaultPrevented).toBe(true)
  })
})

describe('drops that carry nothing usable', () => {
  it('ignores a drop with no data transfer at all', async () => {
    await start()
    const event = new DragEvent('drop', { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', { value: null })

    rowFor('archive').dispatchEvent(event)

    expect(actionsTaken()).toStrictEqual(NOTHING_HAPPENED)
  })

  it('ignores a drop carrying neither files nor a path', async () => {
    await start()

    rowFor('archive').dispatchEvent(dragEvent('drop', new DataTransfer()))

    expect(actionsTaken()).toStrictEqual(NOTHING_HAPPENED)
  })

  it('describes a rejection that is not an Error', async () => {
    client.move.mockRejectedValue('just a string')
    await start()

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(statusText()).toContain('unknown error')
  })
})

describe('after a move succeeds', () => {
  it('reveals the destination', async () => {
    await start([])
    client.tree.mockResolvedValue(TREE_AFTER_MOVE)

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(rowFor('archive/notes.md')).toBeDefined()
  })

  it('reports a refusal to the user rather than failing silently', async () => {
    client.move.mockRejectedValue(new FilesRequestError(409, 'Already exists', 'ALREADY_EXISTS', []))
    await start()

    drag('notes.md', rowFor('archive'))

    await settled()

    expect(statusText()).toContain('Already exists')
  })
})
