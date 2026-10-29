'use sanity'

import { errorMessage } from '../platform/error-message.ts'
import { onPanelChanged } from '../platform/announce/panel-changed.ts'
import { panelShowing, SEARCH_PANEL } from '../platform/panels.ts'
import type { Toast } from '../platform/toast.ts'

import type { FilesClient, SearchHit } from './files-client.ts'

const FORM_SELECTOR = '[data-part="search-form"]'
const FIELD_SELECTOR = '[data-part="search-field"]'
const RESULTS_SELECTOR = '[data-part="search-results"]'
const SAID_SELECTOR = '[data-part="search-said"]'

const SEARCHING = 'Searching…'
const NOTHING_FOUND = 'No matches'
const AND_MORE = ', and more beyond it'

const NOTHING_ASKED = ''
const NOTHING_FOUND_COUNT = 0
const ONE_MATCH = 1

interface SearchPanelOptions {
  root: ParentNode
  client: FilesClient
  toast: Toast
  track: (work: Promise<void>) => void
}

interface SearchPanel {
  bind: () => void
  release: () => void
}

function matchesIn(count: number): string {
  if (count === NOTHING_FOUND_COUNT) return NOTHING_FOUND

  return `${String(count)} ${count === ONE_MATCH ? 'match' : 'matches'}`
}

function rowFor({ path, line, excerpt }: SearchHit): HTMLElement {
  const row = document.createElement('li')
  row.className = 'result'

  const where = document.createElement('span')
  where.className = 'result__where'
  where.textContent = `${path}:${String(line)}`

  const said = document.createElement('span')
  said.className = 'result__excerpt'
  said.textContent = excerpt

  row.append(where, said)

  return row
}

export function createSearchPanel(options: SearchPanelOptions): SearchPanel {
  const { root, client, toast } = options

  function field(): HTMLInputElement | null {
    return root.querySelector<HTMLInputElement>(FIELD_SELECTOR)
  }

  const { offPanelChanged } = onPanelChanged(root, () => {
    if (panelShowing(root) === SEARCH_PANEL) field()?.focus()
  })

  function bind(): void {
    const form = root.querySelector<HTMLFormElement>(FORM_SELECTOR)
    const asking = field()
    const said = root.querySelector<HTMLElement>(SAID_SELECTOR)
    const results = root.querySelector<HTMLElement>(RESULTS_SELECTOR)
    if (form === null || asking === null || said === null || results === null) return

    const say = (text: string): void => {
      said.textContent = text
      said.hidden = false
    }

    const show = (hits: readonly SearchHit[], capped: boolean): void => {
      results.replaceChildren(...hits.map(rowFor))
      say(capped ? `${matchesIn(hits.length)}${AND_MORE}` : matchesIn(hits.length))
    }

    const run = async (query: string): Promise<void> => {
      try {
        const { hits, capped } = await client.search(query)
        show(hits, capped)
      } catch (error) {
        toast.error(errorMessage(error))
      }
    }

    form.addEventListener('submit', (event: Event) => {
      event.preventDefault()

      const query = asking.value.trim()
      if (query === NOTHING_ASKED) return

      say(SEARCHING)
      options.track(run(query))
    })
  }

  return { bind, release: offPanelChanged }
}
