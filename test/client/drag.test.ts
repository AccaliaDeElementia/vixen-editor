'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestOnly } from '../../src/client/files/drag.ts'
import { FilesRequestError } from '../../src/client/files/files-client.ts'
import { initFileTree } from '../../src/client/files/index.ts'
import { parseTree, type TrashNode } from '../../src/client/files/tree-model.ts'
import { ROW_SELECTOR, TRASH_PATH } from '../../src/client/files/tree-view.ts'

const { DRAG_MIME, DROP_TARGET_CLASS, canMoveInto, containerOf, joinInto } = TestOnly

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
  ],
})

// What the server returns once notes.md has been moved into archive.
const MOVED = parseTree({
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

const TRASHED: TrashNode = {
  id: 'aaaa',
  originalPath: 'gone.md',
  kind: 'document',
  deletedAt: '2026-01-01T00:00:00.000Z',
}

interface FakeClient {
  tree: ReturnType<typeof vi.fn>
  trash: ReturnType<typeof vi.fn>
  createDocument: ReturnType<typeof vi.fn>
  createFolder: ReturnType<typeof vi.fn>
  upload: ReturnType<typeof vi.fn>
  move: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  purge: ReturnType<typeof vi.fn>
}

let client: FakeClient
let dialogs: { prompt: ReturnType<typeof vi.fn>; confirm: ReturnType<typeof vi.fn> }

function page(): void {
  document.body.innerHTML = '<aside id="explorer"><ul id="file-tree" role="tree"></ul></aside><div id="status"></div>'
}

async function start(open: string[] = ['archive', 'journal']): Promise<void> {
  await initFileTree({ root: document, pathname: '/doc/', client: client as never, dialogs: dialogs as never })
  for (const folder of open) rowFor(folder).click()
}

function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
}

function rowFor(entryPath: string): HTMLElement {
  const found = rows().find((element) => element.dataset.path === entryPath)
  if (found === undefined) throw new Error(`no row for ${entryPath}`)
  return found
}

function tree(): HTMLElement {
  const element = document.querySelector<HTMLElement>('#file-tree')
  if (element === null) throw new Error('missing tree')
  return element
}

// happy-dom ignores `dataTransfer` in the DragEvent init and leaves the
// property undefined, so it is attached by hand. Everything downstream — files,
// types, getData — then behaves as a browser does. The Playwright suite drags
// for real, because a shimmed environment is exactly where this could lie.
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

function statusText(): string {
  return document.querySelector('#status')?.textContent ?? ''
}

beforeEach(() => {
  localStorage.clear()
  page()
  client = {
    tree: vi.fn().mockResolvedValue(SAMPLE),
    trash: vi.fn().mockResolvedValue([TRASHED]),
    createDocument: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue('uploaded.png'),
    move: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn().mockResolvedValue(undefined),
  }
  dialogs = { prompt: vi.fn().mockResolvedValue(true), confirm: vi.fn().mockResolvedValue(true) }
})

describe('containerOf', () => {
  it.each([
    ['a folder takes drops into itself', { path: 'journal', expandable: true, kind: 'folder' as const }, 'journal'],
    [
      'a document takes drops beside it',
      { path: 'journal/a.md', expandable: false, kind: 'document' as const },
      'journal',
    ],
    ['a root document targets the root', { path: 'a.md', expandable: false, kind: 'document' as const }, ''],
    ['an image behaves like a document', { path: 'p.png', expandable: false, kind: 'image' as const }, ''],
  ])('%s', (_label, row, expected) => {
    expect(containerOf(row)).toBe(expected)
  })

  it('treats the tree background as the store root', () => {
    expect(containerOf(undefined)).toBe('')
  })

  it.each([
    ['the trash pseudo-folder', { path: TRASH_PATH, expandable: true, kind: 'trash' as const }],
    ['a deleted entry', { path: 'gone.md', expandable: false, kind: 'trashed' as const }],
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

describe('joinInto', () => {
  it('joins onto a directory', () => {
    expect(joinInto('archive', 'notes.md')).toBe('archive/notes.md')
  })

  it('returns the bare name at the root', () => {
    expect(joinInto('', 'notes.md')).toBe('notes.md')
  })
})

describe('moving by drag', () => {
  it('moves a document into the folder it was dropped on', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(client.move).toHaveBeenCalledWith('notes.md', 'archive/notes.md', false)
    })
  })

  it('drops beside a document rather than inside it', async () => {
    await start()

    drag('notes.md', rowFor('archive/old.md'))

    await vi.waitFor(() => {
      expect(client.move).toHaveBeenCalledWith('notes.md', 'archive/notes.md', false)
    })
  })

  it('moves a whole folder', async () => {
    await start()

    drag('journal', rowFor('archive'))

    await vi.waitFor(() => {
      expect(client.move).toHaveBeenCalledWith('journal', 'archive/journal', false)
    })
  })

  it('never asks to overwrite on the first attempt', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(client.move).toHaveBeenCalled()
    })
    expect(client.move).toHaveBeenCalledWith('notes.md', 'archive/notes.md', false)
    expect(dialogs.confirm).not.toHaveBeenCalled()
  })

  it('refreshes the tree after a move', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })
  })

  it('does nothing when dropped back on its own parent', async () => {
    await start()

    drag('archive/old.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })
    expect(client.move).not.toHaveBeenCalled()
  })

  it('reports a move the server refuses for a reason the user cannot fix', async () => {
    client.move.mockRejectedValue(new FilesRequestError(409, 'Cannot move into its own descendant', 'INVALID_MOVE', []))
    await start()

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(statusText()).toContain('Cannot move into its own descendant')
    })
  })
})

describe('showing where the entry went', () => {
  it('opens the destination folder so the moved entry is visible', async () => {
    await start([])
    client.tree.mockResolvedValue(MOVED)

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(rows().map((row) => row.dataset.path)).toContain('archive/notes.md')
    })
  })

  it('selects the entry at its new path', async () => {
    await start([])
    client.tree.mockResolvedValue(MOVED)

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(rowFor('archive/notes.md').getAttribute('aria-selected')).toBe('true')
    })
  })

  it('reveals nothing when the drop was a no-op', async () => {
    await start()
    client.tree.mockResolvedValue(MOVED)

    drag('archive/old.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(client.tree).toHaveBeenCalledTimes(2)
    })
    expect(client.move).not.toHaveBeenCalled()
  })
})

describe('confirming an overwrite', () => {
  beforeEach(() => {
    client.move
      .mockRejectedValueOnce(new FilesRequestError(409, 'Would overwrite', 'WOULD_OVERWRITE', ['archive/notes.md']))
      .mockResolvedValueOnce(undefined)
  })

  it('asks, listing exactly what would be lost', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(dialogs.confirm).toHaveBeenCalled()
    })
    const request: unknown = dialogs.confirm.mock.calls[0]?.[0]
    const message = typeof request === 'object' && request !== null && 'message' in request ? request.message : ''

    expect(message).toContain('archive/notes.md')
  })

  it('repeats the request with the flag once confirmed', async () => {
    await start()

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(client.move).toHaveBeenLastCalledWith('notes.md', 'archive/notes.md', true)
    })
  })

  it('leaves everything alone when declined', async () => {
    dialogs.confirm.mockResolvedValue(false)
    await start()

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(dialogs.confirm).toHaveBeenCalled()
    })
    expect(client.move).toHaveBeenCalledTimes(1)
  })

  it('reveals the destination once the replacement goes through', async () => {
    await start([])
    client.tree.mockResolvedValue(MOVED)

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(client.move).toHaveBeenLastCalledWith('notes.md', 'archive/notes.md', true)
    })
    await vi.waitFor(() => {
      expect(rows().some((row) => row.getAttribute('aria-selected') === 'true')).toBe(true)
    })
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
    expect(rowFor('journal/2026').className).not.toContain(DROP_TARGET_CLASS)
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

    await vi.waitFor(() => {
      expect(client.upload).toHaveBeenCalledWith('archive', expect.objectContaining({ name: 'a.png' }))
    })
  })

  it('uploads into the root when dropped on the tree background', async () => {
    await start()
    const transfer = externalTransfer(new File(['x'], 'a.png'))

    tree().dispatchEvent(dragEvent('drop', transfer))

    await vi.waitFor(() => {
      expect(client.upload).toHaveBeenCalledWith('', expect.objectContaining({ name: 'a.png' }))
    })
  })

  it('takes the drop position over the selection', async () => {
    await start()
    rowFor('notes.md').click()
    const transfer = externalTransfer(new File(['x'], 'a.png'))

    rowFor('archive').dispatchEvent(dragEvent('drop', transfer))

    await vi.waitFor(() => {
      expect(client.upload).toHaveBeenCalledWith('archive', expect.anything())
    })
  })

  it('sends each file separately, so one rejection does not discard the rest', async () => {
    await start()
    client.upload.mockRejectedValueOnce(new Error('too large')).mockResolvedValueOnce('b.png')
    const transfer = externalTransfer(new File(['x'], 'a.png'), new File(['y'], 'b.png'))

    rowFor('archive').dispatchEvent(dragEvent('drop', transfer))

    await vi.waitFor(() => {
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

    expect(client.move).not.toHaveBeenCalled()
    expect(client.upload).not.toHaveBeenCalled()
  })

  it('ignores a drop carrying neither files nor a path', async () => {
    await start()

    rowFor('archive').dispatchEvent(dragEvent('drop', new DataTransfer()))

    expect(client.move).not.toHaveBeenCalled()
    expect(client.upload).not.toHaveBeenCalled()
  })

  it('describes a rejection that is not an Error', async () => {
    client.move.mockRejectedValue('just a string')
    await start()

    drag('notes.md', rowFor('archive'))

    await vi.waitFor(() => {
      expect(statusText()).toContain('unknown error')
    })
  })
})
