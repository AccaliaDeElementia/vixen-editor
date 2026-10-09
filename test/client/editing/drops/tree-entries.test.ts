'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { bindEntryDrops, TestOnly as DropTestOnly } from '../../../../src/client/editing/drops.ts'
import { TestOnly } from '../../../../src/client/browser/drag.ts'

import { cast } from '../../../cast.ts'

const { DRAG_KIND_MIME, DRAG_MIME } = TestOnly
const { draggedEntry } = DropTestOnly

function transferWith(entries: Record<string, string>, files: File[] = []): DataTransfer {
  return cast<DataTransfer>({
    getData: (type: string) => entries[type] ?? '',
    types: files.length > 0 ? ['Files'] : Object.keys(entries),
    files,
  })
}

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

  function editor(
    positionAt: (event: DragEvent) => number | null = () => 7,
    holder: () => string | null = () => 'journal/notes.md',
  ): HTMLElement {
    const element = document.createElement('div')
    document.body.append(element)

    bindEntryDrops(element, positionAt, {
      holder,
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

describe('dropping onto an editor that holds no document', () => {
  it('inserts nothing, because there is nothing for a link to be relative to', () => {
    const inserted: Array<{ text: string; at: number | null }> = []
    const element = document.createElement('div')
    document.body.append(element)
    bindEntryDrops(element, () => 7, {
      holder: () => null,
      insert: (text, at) => {
        inserted.push({ text, at })
      },
    })

    const event = cast<DragEvent>(new Event('drop', { bubbles: true, cancelable: true }))
    Object.defineProperty(event, 'dataTransfer', {
      value: transferWith({ [DRAG_MIME]: 'journal/other.md', [DRAG_KIND_MIME]: 'document' }),
      configurable: true,
    })
    element.dispatchEvent(event)

    expect(inserted).toStrictEqual([])
  })
})
