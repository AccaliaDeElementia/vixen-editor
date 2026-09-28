'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bindEntryDrops, linkTo, TestOnly as DropTestOnly } from '../../src/client/editor/drops.ts'
import { TestOnly } from '../../src/client/files/drag.ts'

import { cast } from '../cast.ts'

const { DRAG_KIND_MIME, DRAG_MIME } = TestOnly
const { draggedEntry, linkFor } = DropTestOnly

function transferWith(entries: Record<string, string>, files: File[] = []): DataTransfer {
  return cast<DataTransfer>({
    getData: (type: string) => entries[type] ?? '',
    types: files.length > 0 ? ['Files'] : Object.keys(entries),
    files,
  })
}

describe('the link a tree path becomes', () => {
  it('embeds an image, the same as dragging it', () => {
    expect(linkTo('journal/p.png', 'journal/notes.md')).toBe('![p.png](p.png)')
  })

  it('links a document, the same as dragging it', () => {
    expect(linkTo('journal/a.md', 'journal/notes.md')).toBe('[a.md](a.md)')
  })

  it('treats a path with no document or image extension as a folder', () => {
    expect(linkTo('journal/sub', 'journal/notes.md')).toBe('[sub](sub/)')
  })

  it('treats a folder whose name carries an extension as a folder too', () => {
    expect(linkTo('journal/v1.2', 'journal/notes.md')).toBe('[v1.2](v1.2/)')
  })
})

describe('the link a dragged entry becomes', () => {
  it('links a document by its name, relative to the document holding it', () => {
    expect(linkFor({ path: 'journal/a.md', kind: 'document' }, 'journal/notes.md')).toBe('[a.md](a.md)')
  })

  it('embeds an image rather than linking it', () => {
    expect(linkFor({ path: 'journal/p.png', kind: 'image' }, 'journal/notes.md')).toBe('![p.png](p.png)')
  })

  it('gives a folder a trailing slash, or its index resolves against the wrong directory', () => {
    expect(linkFor({ path: 'journal', kind: 'folder' }, 'notes.md')).toBe('[journal](journal/)')
  })

  it('walks upwards when the entry is above the document', () => {
    expect(linkFor({ path: 'top.md', kind: 'document' }, 'journal/2026/notes.md')).toBe('[top.md](../../top.md)')
  })

  it('encodes a space, which would otherwise end the destination', () => {
    expect(linkFor({ path: 'my file.md', kind: 'document' }, 'notes.md')).toBe('[my file.md](my%20file.md)')
  })

  it('encodes a folder name before adding its slash', () => {
    expect(linkFor({ path: 'my folder', kind: 'folder' }, 'notes.md')).toBe('[my folder](my%20folder/)')
  })
})

describe('reading what was dragged', () => {
  it('reads the path and the kind the tree put on the drag', () => {
    expect(draggedEntry(transferWith({ [DRAG_MIME]: 'a.png', [DRAG_KIND_MIME]: 'image' }))).toStrictEqual({
      path: 'a.png',
      kind: 'image',
    })
  })

  it('treats an unrecognised kind as a document, which is the safe reading', () => {
    expect(draggedEntry(transferWith({ [DRAG_MIME]: 'a.md', [DRAG_KIND_MIME]: 'nonsense' }))?.kind).toBe('document')
  })

  it('ignores a drag carrying no path of ours', () => {
    expect(draggedEntry(transferWith({ 'text/plain': 'hello' }))).toBeNull()
  })

  it('ignores a drop with no transfer at all', () => {
    expect(draggedEntry(null)).toBeNull()
  })
})

describe('dropping onto the editor', () => {
  let inserted: Array<{ text: string; at: number | null }> = []

  function editor(positionAt: (event: DragEvent) => number | null = () => 7): HTMLElement {
    const element = document.createElement('div')
    document.body.append(element)

    bindEntryDrops(element, positionAt, {
      holder: () => 'journal/notes.md',
      insert: (text, at) => {
        inserted.push({ text, at })
      },
    })

    return element
  }

  function drag(element: HTMLElement, type: 'dragover' | 'drop', entries: Record<string, string>): DragEvent {
    const event = cast<DragEvent>(new Event(type, { bubbles: true, cancelable: true }))
    Object.defineProperty(event, 'dataTransfer', { value: transferWith(entries), configurable: true })
    element.dispatchEvent(event)

    return event
  }

  beforeEach(() => {
    document.body.innerHTML = ''
    inserted = []
  })

  it('inserts the link where it was dropped', () => {
    const element = editor()

    drag(element, 'drop', { [DRAG_MIME]: 'journal/a.md', [DRAG_KIND_MIME]: 'document' })

    expect(inserted).toStrictEqual([{ text: '[a.md](a.md)', at: 7 }])
  })

  it('takes the drop, or the browser navigates away to the dragged entry', () => {
    const element = editor()

    expect(drag(element, 'drop', { [DRAG_MIME]: 'a.md', [DRAG_KIND_MIME]: 'document' }).defaultPrevented).toBe(true)
  })

  it('takes dragover too, without which no drop event is ever delivered', () => {
    const element = editor()

    expect(drag(element, 'dragover', { [DRAG_MIME]: 'a.md', [DRAG_KIND_MIME]: 'document' }).defaultPrevented).toBe(true)
  })

  it('leaves a drag that is not one of ours to the browser', () => {
    const element = editor()

    expect(drag(element, 'dragover', { 'text/plain': 'hello' }).defaultPrevented).toBe(false)
  })

  it('inserts nothing for a drag that is not one of ours', () => {
    const element = editor()

    drag(element, 'drop', { 'text/plain': 'hello' })

    expect(inserted).toStrictEqual([])
  })

  it('falls back to the caret when the drop position cannot be worked out', () => {
    const element = editor(() => null)

    drag(element, 'drop', { [DRAG_MIME]: 'a.md', [DRAG_KIND_MIME]: 'document' })

    expect(inserted).toStrictEqual([{ text: '[a.md](../a.md)', at: null }])
  })
})
