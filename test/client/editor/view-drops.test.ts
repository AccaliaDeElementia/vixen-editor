'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bindViewDrops } from '../../../src/client/editor/view-drops.ts'
import { DRAG_KIND_MIME, DRAG_MIME } from '../../../src/client/drag-payload.ts'
import { cast } from '../../cast.ts'

const VIEWS = ['view-markup', 'view-source', 'view-image']

let host: HTMLElement = document.createElement('div')
let opened: string[] = []
let uploaded: Array<{ directory: string; names: string[] }> = []

function viewFor(part: string): HTMLElement {
  const found = host.querySelector<HTMLElement>(`[data-part="${part}"]`)
  if (found === null) throw new Error(`no ${part}`)

  return found
}

function bound(holder: string | null = 'journal/notes.md'): void {
  bindViewDrops(host, {
    holder: () => holder,
    open: (entryPath: string) => {
      opened.push(entryPath)
    },
    upload: (files: readonly File[], directory: string) => {
      uploaded.push({ directory, names: files.map((file) => file.name) })
    },
  })
}

function transferOf(held: Record<string, string>, files: File[] = []): DataTransfer {
  return cast<DataTransfer>({
    getData: (mime: string) => held[mime] ?? '',
    types: [...Object.keys(held), ...(files.length > 0 ? ['Files'] : [])],
    files,
  })
}

function dropOn(element: HTMLElement, dataTransfer: DataTransfer): boolean {
  const event = cast<DragEvent>(Object.assign(new Event('drop', { bubbles: true, cancelable: true }), { dataTransfer }))

  return element.dispatchEvent(cast<Event>(event))
}

function dragOver(element: HTMLElement, dataTransfer: DataTransfer): boolean {
  const event = cast<DragEvent>(
    Object.assign(new Event('dragover', { bubbles: true, cancelable: true }), { dataTransfer }),
  )

  return element.dispatchEvent(cast<Event>(event))
}

beforeEach(() => {
  opened = []
  uploaded = []
  document.body.innerHTML = ''
  host = document.createElement('section')
  for (const part of VIEWS) {
    const view = document.createElement('div')
    view.dataset.part = part
    host.append(view)
  }
  document.body.append(host)
})

describe('a tree entry dropped onto a view that is not the editor', () => {
  it('opens it there, because a drop onto a preview says show me this here', () => {
    bound()

    dropOn(viewFor('view-markup'), transferOf({ [DRAG_MIME]: 'journal/a.md', [DRAG_KIND_MIME]: 'document' }))

    expect(opened).toStrictEqual(['journal/a.md'])
  })

  it('takes a folder as the folder, so the pane opens what is inside it', () => {
    bound()

    dropOn(viewFor('view-source'), transferOf({ [DRAG_MIME]: 'journal', [DRAG_KIND_MIME]: 'folder' }))

    expect(opened).toStrictEqual(['journal/'])
  })

  it('is accepted on the image view too, which is a view like the others', () => {
    bound()

    dropOn(viewFor('view-image'), transferOf({ [DRAG_MIME]: 'photo.png', [DRAG_KIND_MIME]: 'image' }))

    expect(opened).toStrictEqual(['photo.png'])
  })

  it('claims the drag, or the browser navigates away from the page instead', () => {
    bound()

    const allowed = dragOver(viewFor('view-markup'), transferOf({ [DRAG_MIME]: 'journal/a.md' }))

    expect(allowed).toBe(false)
  })

  it('leaves a drag it does not recognise to whatever else wants it', () => {
    bound()

    const allowed = dragOver(viewFor('view-markup'), transferOf({ 'text/plain': 'hello' }))

    expect(allowed).toBe(true)
  })

  it('opens nothing for a drop carrying neither an entry nor a file', () => {
    bound()

    dropOn(viewFor('view-markup'), transferOf({ 'text/plain': 'hello' }))

    expect(opened).toStrictEqual([])
  })

  it('opens nothing for a drop that carries no transfer, which a drag cancelled mid-flight gives', () => {
    bound()

    dropOn(viewFor('view-markup'), cast<DataTransfer>(null))

    expect(opened).toStrictEqual([])
  })
})

describe('a file dragged from the desktop over a view that is not the editor', () => {
  it('claims the drag before the file list exists, or the browser navigates to the file instead', () => {
    bound()

    const allowed = dragOver(
      viewFor('view-markup'),
      cast<DataTransfer>({ getData: () => '', types: ['Files'], files: [] }),
    )

    expect(allowed).toBe(false)
  })
})

describe('a file dropped from the desktop onto a view that is not the editor', () => {
  it('uploads beside the file being shown, which is the only place the gesture names', () => {
    bound()

    dropOn(viewFor('view-markup'), transferOf({}, [new File(['x'], 'photo.png')]))

    expect(uploaded).toStrictEqual([{ directory: 'journal', names: ['photo.png'] }])
  })

  it('does nothing when the pane is showing nothing, because there is nowhere to put it', () => {
    bound(null)

    dropOn(viewFor('view-markup'), transferOf({}, [new File(['x'], 'photo.png')]))

    expect(uploaded).toStrictEqual([])
  })
})
