'use sanity'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createSearchPanel } from '../../../src/client/browser/search-panel.ts'
import type { FilesClient } from '../../../src/client/browser/files-client.ts'
import type { Toast } from '../../../src/client/platform/toast.ts'

import { announcePanelChanged } from '../../../src/client/platform/announce/panel-changed.ts'
import { FILES_PANEL, SEARCH_PANEL, showPanel } from '../../../src/client/platform/panels.ts'

import { cast } from '../../cast.ts'
import { given } from '../../conditions.ts'
import { renderSection } from '../templates.ts'

const A_HIT = { path: 'folder/notes.md', line: 3, offset: 42, excerpt: 'the lantern went out' }
const ANOTHER_HIT = { path: 'other.md', line: 1, offset: 0, excerpt: 'another lantern' }

let root: HTMLElement = document.createElement('div')
let asked: string[] = []
let complaints: string[] = []
let settling: Array<Promise<void>> = []
let standing: Array<() => void> = []

interface Answering {
  hits?: Array<typeof A_HIT>
  capped?: boolean
  refuse?: Error
}

function panelAnswering({ hits = [], capped = false, refuse }: Answering = {}): void {
  const client = cast<FilesClient>({
    search: (query: string) => {
      asked.push(query)

      return refuse === undefined ? Promise.resolve({ hits, capped }) : Promise.reject(refuse)
    },
  })

  const panel = createSearchPanel({
    root,
    client,
    toast: cast<Toast>({
      error: (text: string) => {
        complaints.push(text)
      },
    }),
    track: (work: Promise<void>) => {
      settling.push(work)
    },
  })

  panel.bind()
  standing.push(panel.release)
}

function submit(typed: string): void {
  const field = root.querySelector<HTMLInputElement>('[data-part="search-field"]')
  if (field !== null) field.value = typed

  root
    .querySelector('[data-part="search-form"]')
    ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
}

async function searchFor(typed: string): Promise<void> {
  submit(typed)

  await Promise.all(settling.splice(0))
}

function rowsShown(): Array<string | null> {
  return [...root.querySelectorAll('[data-part="search-results"] li')].map((row) => row.textContent)
}

function saidInstead(): string {
  const said = root.querySelector<HTMLElement>('[data-part="search-said"]')

  return said?.hidden === false ? said.textContent : ''
}

beforeEach(() => {
  asked = []
  complaints = []
  settling = []
  standing = []
  document.body.innerHTML = ''
  root = document.createElement('div')
  root.innerHTML = `<div id="app">${renderSection('[data-panel="search"]')}</div>`
  document.body.append(root)
})

afterEach(() => {
  for (const release of standing.splice(0)) release()
})

function fieldHasTheFocus(): boolean {
  return document.activeElement === root.querySelector('[data-part="search-field"]')
}

describe('searching every document from the sidebar', () => {
  it('asks the store for what the reader typed', async () => {
    panelAnswering()

    await searchFor('lantern')

    expect(asked).toStrictEqual(['lantern'])
  })

  it('asks for the words alone, rather than the spaces around them', async () => {
    panelAnswering()

    await searchFor('  lantern  ')

    expect(asked).toStrictEqual(['lantern'])
  })

  it('asks nothing at all of a search for nothing', async () => {
    panelAnswering()

    await searchFor('   ')

    expect(asked).toStrictEqual([])
  })

  it('lists a row for each hit, naming the document and the line it is on', async () => {
    panelAnswering({ hits: [A_HIT, ANOTHER_HIT] })

    await searchFor('lantern')

    expect(rowsShown()).toStrictEqual(['folder/notes.md:3the lantern went out', 'other.md:1another lantern'])
  })

  it('replaces what the last search found, rather than piling one search on another', async () => {
    panelAnswering({ hits: [A_HIT] })
    await searchFor('lantern')
    given(() => {
      expect(rowsShown()).toHaveLength(1)
    })

    await searchFor('lantern')

    expect(rowsShown()).toHaveLength(1)
  })
})

describe('what the panel says about a search', () => {
  it('counts what it found, so a reader knows how much there is to work through', async () => {
    panelAnswering({ hits: [A_HIT, ANOTHER_HIT] })

    await searchFor('lantern')

    expect(saidInstead()).toBe('2 matches')
  })

  it('counts one match as one, rather than as one matches', async () => {
    panelAnswering({ hits: [A_HIT] })

    await searchFor('lantern')

    expect(saidInstead()).toBe('1 match')
  })

  it('says plainly when nothing matched', async () => {
    panelAnswering()

    await searchFor('lantern')

    expect(saidInstead()).toBe('No matches')
  })

  it('says there are more where the scan stopped at its cap', async () => {
    panelAnswering({ hits: [A_HIT], capped: true })

    await searchFor('lantern')

    expect(saidInstead()).toBe('1 match, and more beyond it')
  })

  it('says it is searching before the answer comes back', () => {
    panelAnswering({ hits: [A_HIT] })

    submit('lantern')

    expect(saidInstead()).toBe('Searching…')
  })

  it('reports a search the server refused, rather than leaving the last results standing', async () => {
    panelAnswering({ refuse: new Error('disk on fire') })

    await searchFor('lantern')

    expect(complaints).toStrictEqual(['disk on fire'])
  })
})

describe('the panel coming up in the sidebar', () => {
  it('takes the focus into the field, so a reader can type the moment they ask for it', () => {
    panelAnswering()
    showPanel(root, SEARCH_PANEL)

    announcePanelChanged(root)

    expect(fieldHasTheFocus()).toBe(true)
  })

  it('leaves the focus alone when the sidebar came up on another panel', () => {
    panelAnswering()
    showPanel(root, FILES_PANEL)

    announcePanelChanged(root)

    expect(fieldHasTheFocus()).toBe(false)
  })

  it('stops listening once released, so a torn-down sidebar does not grab the focus', () => {
    panelAnswering()
    showPanel(root, SEARCH_PANEL)
    for (const release of standing.splice(0)) release()

    announcePanelChanged(root)

    expect(fieldHasTheFocus()).toBe(false)
  })
})

describe('a page with no search panel in it', () => {
  it('is left alone, rather than throwing on the way past', () => {
    root.replaceChildren()

    expect(() => {
      panelAnswering()
    }).not.toThrow()
  })

  it.each(['search-field', 'search-said', 'search-results'])(
    'leaves a panel missing its %s alone, rather than half using it',
    async (part) => {
      root.querySelector(`[data-part="${part}"]`)?.remove()
      panelAnswering({ hits: [A_HIT] })

      await searchFor('lantern')

      expect(asked).toStrictEqual([])
    },
  )
})
