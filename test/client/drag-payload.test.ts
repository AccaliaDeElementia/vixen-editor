'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { TestOnly } from '../../src/client/files/drag.ts'
import { initFileTree } from '../../src/client/files/index.ts'
import { parseTree } from '../../src/client/files/tree-model.ts'
import { ROW_SELECTOR } from '../../src/client/files/tree-view.ts'
import type { FilesClient } from '../../src/client/files/files-client.ts'
import { cast } from '../cast.ts'

const { DRAG_KIND_MIME, DRAG_MIME } = TestOnly

const SAMPLE = parseTree({
  tree: [
    { name: 'journal', path: 'journal', kind: 'folder', children: [] },
    { name: 'notes.md', path: 'notes.md', kind: 'document' },
    { name: 'photo.png', path: 'photo.png', kind: 'image' },
  ],
})

let host: HTMLElement = document.createElement('div')

function page(): HTMLElement {
  document.body.innerHTML = ''
  const created = document.createElement('div')
  created.innerHTML = '<aside id="explorer"><ul id="file-tree" role="tree"></ul></aside><div id="status"></div>'
  document.body.append(created)

  return created
}

function fakeClient(): { tree: ReturnType<typeof vi.fn>; trash: ReturnType<typeof vi.fn> } {
  return { tree: vi.fn().mockResolvedValue(SAMPLE), trash: vi.fn().mockResolvedValue([]) }
}

async function start(): Promise<void> {
  await initFileTree({ root: host, pathname: '/doc/', client: cast<FilesClient>(fakeClient()) })
}

function rowFor(entryPath: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)].find(
    (element) => element.dataset.path === entryPath,
  )
  if (found === undefined) throw new Error(`no row for ${entryPath}`)

  return found
}

function dragEvent(type: string, transfer: DataTransfer): DragEvent {
  const event = new DragEvent(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'dataTransfer', { value: transfer })

  return event
}

beforeEach(() => {
  localStorage.clear()
  host = page()
})

describe('what a drag from a row carries', () => {
  async function dragFrom(entryPath: string): Promise<DataTransfer> {
    await start()
    const transfer = new DataTransfer()
    rowFor(entryPath).dispatchEvent(dragEvent('dragstart', transfer))

    return transfer
  }

  it('carries the path, which a move needs', async () => {
    expect((await dragFrom('notes.md')).getData(DRAG_MIME)).toBe('notes.md')
  })

  it('carries the kind, which the editor needs to choose a link or an embed', async () => {
    expect((await dragFrom('notes.md')).getData(DRAG_KIND_MIME)).toBe('document')
  })

  it('says image for an image, so a drop into the editor embeds it', async () => {
    expect((await dragFrom('photo.png')).getData(DRAG_KIND_MIME)).toBe('image')
  })

  it('says folder for a folder, so a drop into the editor adds the trailing slash', async () => {
    expect((await dragFrom('journal')).getData(DRAG_KIND_MIME)).toBe('folder')
  })
})
