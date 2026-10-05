'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../../../../src/client/editor/session.ts'
import { toggleSplit } from '../../../../src/client/layout/split.ts'

const WIDE_ENOUGH = 1200

import { openEditor, page, recorded, sessionRecording, type Recorded } from '../../editor-fixtures.ts'

let root: HTMLElement = document.createElement('div')
let record: Recorded = recorded()

function fakeSession(content: string): Session {
  return sessionRecording(record, { load: () => Promise.resolve({ content, stored: true }) })
}

async function editing(content = '# stored'): Promise<void> {
  await openEditor({ root, pathname: '/doc/notes.md', session: fakeSession(content) })
}

function ribbonButton(): HTMLElement | null {
  return root.querySelector<HTMLElement>('#preview-source')
}

function panes(): HTMLElement | null {
  return root.querySelector<HTMLElement>('[data-part="panes"]')
}

function previewBody(): HTMLElement | null {
  return root.querySelectorAll<HTMLElement>('[data-part="source-body"]')[1] ?? null
}

function press(init: KeyboardEventInit): void {
  root.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }))
}

beforeEach(() => {
  localStorage.clear()
  record = recorded()
  document.body.innerHTML = ''
  root = page()
})

describe('showing the document as source', () => {
  it('splits the workspace, because the preview goes beside the editor', async () => {
    await editing()

    ribbonButton()?.click()

    expect(panes()?.dataset.split).toBe('beside')
  })

  it('writes the document into the second pane, not over the editor', async () => {
    await editing('# stored\n\nprose')

    ribbonButton()?.click()

    expect(previewBody()?.textContent).toBe('# stored\n\nprose')
  })

  it('reveals the preview, which the new pane keeps hidden until something shows in it', async () => {
    await editing()

    ribbonButton()?.click()

    expect(root.querySelectorAll<HTMLElement>('[data-part="view-source"]')[1]?.hidden).toBe(false)
  })

  it('says what it is showing', async () => {
    await editing()

    ribbonButton()?.click()

    expect(root.querySelector('#status')?.textContent).toContain('Showing the source of notes.md')
  })
})

describe('reaching the preview from the keyboard', () => {
  it('opens on Alt and Shift and P', async () => {
    await editing()

    press({ key: 'P', altKey: true, shiftKey: true })

    expect(panes()?.dataset.split).toBe('beside')
  })

  it('stays put without Alt, so typing a capital P does nothing', async () => {
    await editing()

    press({ key: 'P', shiftKey: true })

    expect(panes()?.dataset.split).toBeUndefined()
  })

  it('stays put without Shift', async () => {
    await editing()

    press({ key: 'P', altKey: true })

    expect(panes()?.dataset.split).toBeUndefined()
  })

  it('ignores an event of the same name that carries no key', async () => {
    await editing()

    root.dispatchEvent(new Event('keydown', { bubbles: true }))

    expect(panes()?.dataset.split).toBeUndefined()
  })
})

describe('asking for the preview when the workspace is already split', () => {
  it('leaves the orientation the reader chose alone', async () => {
    await editing()
    toggleSplit(root, 'below', WIDE_ENOUGH)

    ribbonButton()?.click()

    expect(panes()?.dataset.split).toBe('below')
  })
})

describe('a page with nowhere to put a preview', () => {
  it('is left alone rather than failing', async () => {
    await editing()
    root.querySelector('[data-part="panes"]')?.remove()

    ribbonButton()?.click()

    expect(root.querySelector('[data-part="panes"]')).toBeNull()
  })
})
