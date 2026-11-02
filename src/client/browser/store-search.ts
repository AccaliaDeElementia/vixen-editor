'use sanity'

import { docUrlAt } from '../platform/doc-path.ts'
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

interface StoreSearchOptions {
  root: ParentNode
  client: FilesClient
  toast: Toast
  track: (work: Promise<void>) => void
  navigate: (url: string) => void
}

interface StoreSearch {
  bind: () => void
  release: () => void
}

function matchesIn(count: number): string {
  if (count === NOTHING_FOUND_COUNT) return NOTHING_FOUND

  return `${String(count)} ${count === ONE_MATCH ? 'match' : 'matches'}`
}

function rowFor({ path, line, offset, excerpt }: SearchHit, matched: string, open: (url: string) => void): HTMLElement {
  const row = document.createElement('li')
  const reach = document.createElement('button')
  reach.type = 'button'
  reach.className = 'result'
  reach.addEventListener('click', () => {
    open(docUrlAt(path, offset, matched))
  })

  const where = document.createElement('span')
  where.className = 'result__where'
  where.textContent = `${path}:${String(line)}`

  const said = document.createElement('span')
  said.className = 'result__excerpt'
  said.textContent = excerpt

  reach.append(where, said)
  row.append(reach)

  return row
}

export function createStoreSearch(options: StoreSearchOptions): StoreSearch {
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

    const show = (hits: readonly SearchHit[], capped: boolean, matched: string): void => {
      results.replaceChildren(...hits.map((hit) => rowFor(hit, matched, options.navigate)))
      say(capped ? `${matchesIn(hits.length)}${AND_MORE}` : matchesIn(hits.length))
    }

    const run = async (query: string): Promise<void> => {
      try {
        const { hits, capped } = await client.search(query)
        show(hits, capped, query)
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
