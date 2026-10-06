'use sanity'

import { basenameOf } from '../../shared/link-paths.ts'
import { tabIdentity, type TabAt } from './open-tabs.ts'

const TAB_CLASS = 'tabs__tab'
const EPHEMERAL_CLASS = 'tabs__tab--looking'
const CLOSE_CLASS = 'tabs__close'
const NAME_CLASS = 'tabs__name'
const CLOSE_GLYPH = 'close'
const EPHEMERAL_DESCRIPTION = 'closes when you open something else'
const REACHABLE = 0
const PASSED_OVER = -1

interface ShownTab extends TabAt {
  name?: string
  ephemeral?: boolean
}

interface TabStripOptions {
  onActivate: (at: TabAt) => void
  onKeep: (at: TabAt) => void
  onClose: (at: TabAt) => void
}

export interface TabStrip {
  show: (tabs: readonly ShownTab[], active: TabAt | null) => void
}

function labelFor(tab: ShownTab): string {
  return tab.name ?? basenameOf(tab.path)
}

export function createTabStrip(host: HTMLElement, options: TabStripOptions): TabStrip {
  host.setAttribute('role', 'tablist')

  const drawn = new Map<string, HTMLElement>()

  function closerFor(tab: ShownTab, at: TabAt): HTMLElement {
    const { path } = at
    const closer = document.createElement('span')
    closer.className = CLOSE_CLASS
    closer.setAttribute('aria-hidden', 'true')
    closer.dataset.closes = path
    closer.textContent = CLOSE_GLYPH

    closer.addEventListener('click', (event: MouseEvent) => {
      event.stopPropagation()
      options.onClose(at)
    })

    return closer
  }

  function newTab(tab: ShownTab): HTMLElement {
    const element = document.createElement('button')
    element.type = 'button'
    element.className = TAB_CLASS
    element.setAttribute('role', 'tab')

    const { path, view } = tab
    element.dataset.tab = tabIdentity(tab)
    element.dataset.path = path
    element.dataset.view = view
    const name = document.createElement('span')
    name.className = NAME_CLASS
    name.textContent = labelFor(tab)
    element.append(name)

    element.addEventListener('click', () => {
      options.onActivate({ path, view })
    })

    element.addEventListener('dblclick', () => {
      options.onKeep({ path, view })
    })

    element.append(closerFor(tab, { path, view }))

    return element
  }

  function tabFor(tab: ShownTab, active: boolean): HTMLElement {
    const identity = tabIdentity(tab)
    const element = drawn.get(identity) ?? newTab(tab)
    drawn.set(identity, element)

    element.setAttribute('aria-selected', String(active))
    element.tabIndex = active ? REACHABLE : PASSED_OVER

    const looking = tab.ephemeral === true
    element.classList.toggle(EPHEMERAL_CLASS, looking)
    if (looking) element.setAttribute('aria-description', EPHEMERAL_DESCRIPTION)
    else element.removeAttribute('aria-description')

    return element
  }

  return {
    show(tabs: readonly ShownTab[], active: TabAt | null): void {
      const selected = active === null ? null : tabIdentity(active)
      const wanted = tabs.map((tab) => tabFor(tab, tabIdentity(tab) === selected))
      const open = new Set(wanted.map((element) => element.dataset.tab))

      for (const identity of [...drawn.keys()]) if (!open.has(identity)) drawn.delete(identity)
      host.replaceChildren(...wanted)
    },
  }
}
