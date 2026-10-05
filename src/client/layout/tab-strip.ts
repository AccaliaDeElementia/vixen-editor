'use sanity'

import { basenameOf } from '../../shared/link-paths.ts'

const TAB_CLASS = 'tabs__tab'
const REACHABLE = 0
const PASSED_OVER = -1

type TabView = 'editor' | 'source' | 'markup'

interface TabAt {
  path: string
  view: TabView
}

interface ShownTab extends TabAt {
  name?: string
}

interface TabStripOptions {
  onActivate: (at: TabAt) => void
}

export interface TabStrip {
  show: (tabs: readonly ShownTab[], active: TabAt) => void
}

function identityOf({ path, view }: TabAt): string {
  return `${view}:${path}`
}

function labelFor(tab: ShownTab): string {
  return tab.name ?? basenameOf(tab.path)
}

export function createTabStrip(host: HTMLElement, options: TabStripOptions): TabStrip {
  host.setAttribute('role', 'tablist')

  function tabFor(tab: ShownTab, active: boolean): HTMLElement {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = TAB_CLASS
    element.setAttribute('role', 'tab')
    element.setAttribute('aria-selected', String(active))
    element.tabIndex = active ? REACHABLE : PASSED_OVER

    const { path, view } = tab
    element.dataset.tab = identityOf(tab)
    element.dataset.path = path
    element.dataset.view = view
    element.textContent = labelFor(tab)

    element.addEventListener('click', () => {
      options.onActivate({ path, view })
    })

    return element
  }

  return {
    show(tabs: readonly ShownTab[], active: TabAt): void {
      const wanted = identityOf(active)

      host.replaceChildren(...tabs.map((tab) => tabFor(tab, identityOf(tab) === wanted)))
    },
  }
}
