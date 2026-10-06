'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import type { Session } from '../../../../src/client/editor/session.ts'
import { toggleSplit } from '../../../../src/client/layout/split.ts'
import { writeKeptTabs } from '../../../../src/client/layout/kept-tabs.ts'
import { requestKeep } from '../../../../src/client/keep-request.ts'

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

describe('showing the document rendered', () => {
  function markupBody(): HTMLElement | null {
    return root.querySelectorAll<HTMLElement>('[data-part="markup-body"]')[1] ?? null
  }

  it('renders the document in the second pane', async () => {
    await editing('# A heading')

    root.querySelector<HTMLElement>('#preview-markup')?.click()

    expect(markupBody()?.querySelector('h1')?.textContent).toBe('A heading')
  })

  it('says what it is showing', async () => {
    await editing()

    root.querySelector<HTMLElement>('#preview-markup')?.click()

    expect(root.querySelector('#status')?.textContent).toContain('Showing a preview of notes.md')
  })

  it('opens on Alt and P', async () => {
    await editing()

    press({ key: 'p', altKey: true })

    expect(panes()?.dataset.split).toBe('beside')
  })

  it('stays put without Alt', async () => {
    await editing()

    press({ key: 'p' })

    expect(panes()?.dataset.split).toBeUndefined()
  })

  it('puts the source preview away, since one pane shows one thing', async () => {
    await editing()
    root.querySelector<HTMLElement>('#preview-source')?.click()

    root.querySelector<HTMLElement>('#preview-markup')?.click()

    expect(root.querySelectorAll<HTMLElement>('[data-part="view-source"]')[1]?.hidden).toBe(true)
  })
})

describe('a preview that is already a tab', () => {
  function previewTab(path: string, view: string): HTMLElement | null {
    return root.querySelector<HTMLElement>(`[data-tab="${view}:${path}"]`)
  }

  it('appears in the second pane as a tab of its own view type', async () => {
    await editing()

    root.querySelector<HTMLElement>('#preview-markup')?.click()

    expect(previewTab('notes.md', 'markup')).not.toBeNull()
  })

  it('displaces the other preview while both are only being looked at', async () => {
    await editing()
    root.querySelector<HTMLElement>('#preview-markup')?.click()

    root.querySelector<HTMLElement>('#preview-source')?.click()

    expect(previewTab('notes.md', 'markup')).toBeNull()
  })

  it('sits beside the other preview once the document is kept', async () => {
    await editing()
    requestKeep(root, 'notes.md')
    root.querySelector<HTMLElement>('#preview-markup')?.click()

    root.querySelector<HTMLElement>('#preview-source')?.click()

    expect(previewTab('notes.md', 'markup')).not.toBeNull()
  })

  it('renders again when its tab is activated', async () => {
    await editing('# first')
    root.querySelector<HTMLElement>('#preview-markup')?.click()
    const [, body] = root.querySelectorAll<HTMLElement>('[data-part="markup-body"]')
    body?.replaceChildren('wiped')

    previewTab('notes.md', 'markup')?.click()

    expect(body?.querySelector('h1')?.textContent).toBe('first')
  })

  it('is only looked at when the editor tab it came from is', async () => {
    await editing()

    root.querySelector<HTMLElement>('#preview-markup')?.click()

    expect(previewTab('notes.md', 'markup')?.classList.contains('tabs__tab--looking')).toBe(true)
  })

  it('is kept when the editor tab it came from is, so it cannot vanish underneath', async () => {
    await editing()
    requestKeep(root, 'notes.md')

    root.querySelector<HTMLElement>('#preview-markup')?.click()

    expect(previewTab('notes.md', 'markup')?.classList.contains('tabs__tab--looking')).toBe(false)
  })
})

describe('a preview tab for a document the editor has left', () => {
  it('opens that document rather than showing something stale', async () => {
    writeKeptTabs('secondary', [{ path: 'elsewhere.md', view: 'markup' }])
    const opened: string[] = []
    await openEditor({
      root,
      pathname: '/doc/notes.md',
      session: fakeSession('# stored'),
      openUrl: (url: string) => {
        opened.push(url)
      },
    })
    root.querySelector<HTMLElement>('#preview-markup')?.click()

    root.querySelector<HTMLElement>('[data-tab="markup:elsewhere.md"]')?.click()

    expect(opened).toStrictEqual(['/doc/elsewhere.md'])
  })
})

describe('a second pane that was dismissed and summoned again', () => {
  it('builds its tabs in the pane that is on screen now, not the one that went', async () => {
    await editing()
    root.querySelector<HTMLElement>('#preview-markup')?.click()
    toggleSplit(root, 'beside', WIDE_ENOUGH)

    root.querySelector<HTMLElement>('#preview-markup')?.click()

    expect(root.querySelector('[data-tab="markup:notes.md"]')).not.toBeNull()
  })
})
