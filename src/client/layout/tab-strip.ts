'use sanity'

import { basenameOf } from '../../shared/link-paths.ts'
import { tabIdentity, type TabAt } from './open-tabs.ts'

const TAB_CLASS = 'tabs__tab'
const REACHABLE = 0
const PASSED_OVER = -1

interface ShownTab extends TabAt {
  name?: string
}

interface TabStripOptions {
  onActivate: (at: TabAt) => void
}

export interface TabStrip {
  show: (tabs: readonly ShownTab[], active: TabAt | null) => void
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
    element.dataset.tab = tabIdentity(tab)
    element.dataset.path = path
    element.dataset.view = view
    element.textContent = labelFor(tab)

    element.addEventListener('click', () => {
      options.onActivate({ path, view })
    })

    return element
  }

  return {
    show(tabs: readonly ShownTab[], active: TabAt | null): void {
      const wanted = active === null ? null : tabIdentity(active)

      host.replaceChildren(...tabs.map((tab) => tabFor(tab, tabIdentity(tab) === wanted)))
    },
  }
}
