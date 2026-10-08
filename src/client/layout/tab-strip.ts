'use sanity'

import { basenameOf } from '../../shared/link-paths.ts'
import { DRAG_MIME, DRAG_TAB_MIME } from '../drag-payload.ts'
import { decorativeIcon, ENTRY_GLYPHS } from '../tree-rows.ts'
import type { TabView } from '../doc-path.ts'
import { tabIdentity, type TabAt } from './open-tabs.ts'

const SCROLLER_SELECTOR = '[data-part="tabs-scroller"]'
const SCROLL_SELECTOR = '.tabs__scroll'
const BEFORE_PART = 'tabs-before'
const REACH_BEFORE = 'data-reach-before'
const REACH_AFTER = 'data-reach-after'
const MOST_OF_THE_WIDTH = 0.8
const AT_THE_START = 0
const TOWARDS_THE_START = -1
const TOWARDS_THE_END = 1
const TAB_CLASS = 'tabs__tab'
const EPHEMERAL_CLASS = 'tabs__tab--looking'
const CLOSE_CLASS = 'tabs__close'
const NAME_CLASS = 'tabs__name'
const KIND_CLASS = 'tabs__kind'
const NOTHING_DRAGGED = ''
const CLOSE_GLYPH = 'close'
const EPHEMERAL_DESCRIPTION = 'closes when you open something else'
const VIEW_DESCRIPTIONS: Readonly<Record<string, string>> = { source: 'HTML', markup: 'preview' }
const ICON_CLASS = 'icon tabs__icon'
const MUTED_TONE = 'muted'

interface TabIcon {
  glyph: string
  tone: string
}

const TAB_ICONS: Readonly<Record<TabView, TabIcon>> = {
  editor: { glyph: ENTRY_GLYPHS.document, tone: 'document' },
  image: { glyph: ENTRY_GLYPHS.image, tone: 'image' },
  source: { glyph: 'code_blocks', tone: 'source' },
  markup: { glyph: 'preview', tone: 'markup' },
  missing: { glyph: 'search_off', tone: MUTED_TONE },
  deleted: { glyph: 'delete', tone: MUTED_TONE },
  unreachable: { glyph: 'cloud_off', tone: MUTED_TONE },
}

const REACHABLE = 0
const PASSED_OVER = -1

function iconFor(view: TabView): HTMLElement {
  const { [view]: shown } = TAB_ICONS

  return decorativeIcon(shown.glyph, `${ICON_CLASS} icon--${shown.tone}`)
}

interface ShownTab extends TabAt {
  ephemeral?: boolean
}

interface TabStripOptions {
  onActivate: (at: TabAt) => void
  onKeep: (at: TabAt) => void
  onClose: (at: TabAt) => void
  onDropped: (identity: string, toIndex: number) => void
}

export interface TabStrip {
  show: (tabs: readonly ShownTab[], active: TabAt | null) => void
}

function labelFor(tab: ShownTab): string {
  return basenameOf(tab.path)
}

function viewShownBy(tab: ShownTab): string | null {
  const { [tab.view]: shows } = VIEW_DESCRIPTIONS

  return shows ?? null
}

function sayingWhich(what: string, shows: string | null): string {
  return shows === null ? what : `${what}, ${shows}`
}

function kindFor(shows: string): HTMLElement {
  const element = document.createElement('span')
  element.className = KIND_CLASS
  element.textContent = shows

  return element
}

const NOTHING_TO_SHOW: TabStrip = { show: () => undefined }

export function createTabStrip(host: HTMLElement, options: TabStripOptions): TabStrip {
  const found = host.querySelector<HTMLElement>(SCROLLER_SELECTOR)
  if (found === null) return NOTHING_TO_SHOW

  const scroller: HTMLElement = found

  scroller.setAttribute('role', 'tablist')

  const drawn = new Map<string, HTMLElement>()

  function reflectReach(reaching: HTMLElement): void {
    const { scrollLeft, clientWidth, scrollWidth } = reaching

    host.setAttribute(REACH_BEFORE, String(scrollLeft > AT_THE_START))
    host.setAttribute(REACH_AFTER, String(scrollLeft + clientWidth < scrollWidth))
  }
  function reconsiderReach(): void {
    reflectReach(scroller)
  }

  for (const button of host.querySelectorAll<HTMLElement>(SCROLL_SELECTOR)) {
    const towards = button.dataset.part === BEFORE_PART ? TOWARDS_THE_START : TOWARDS_THE_END

    button.addEventListener('click', () => {
      scroller.scrollBy({ left: scroller.clientWidth * MOST_OF_THE_WIDTH * towards })
      reconsiderReach()
    })
  }

  scroller.addEventListener('scroll', reconsiderReach)
  new ResizeObserver(reconsiderReach).observe(scroller)

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
    const shows = viewShownBy(tab)
    element.title = sayingWhich(path, shows)
    element.append(iconFor(view), name)

    if (shows !== null) {
      element.append(kindFor(shows))
      element.setAttribute('aria-label', sayingWhich(labelFor(tab), shows))
    }

    element.addEventListener('click', () => {
      options.onActivate({ path, view })
    })

    element.addEventListener('dblclick', () => {
      options.onKeep({ path, view })
    })

    element.draggable = true

    element.addEventListener('dragstart', (event: DragEvent) => {
      event.dataTransfer?.setData(DRAG_MIME, path)
      event.dataTransfer?.setData(DRAG_TAB_MIME, tabIdentity(tab))
    })

    element.addEventListener('drop', (event: DragEvent) => {
      event.stopPropagation()
      takeDrop(event, [...scroller.children].indexOf(element))
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

  function takeDrop(event: DragEvent, toIndex: number): void {
    const identity = event.dataTransfer?.getData(DRAG_TAB_MIME) ?? NOTHING_DRAGGED
    if (identity === NOTHING_DRAGGED) return

    event.preventDefault()
    options.onDropped(identity, toIndex)
  }

  host.addEventListener('dragover', (event: DragEvent) => {
    if (event.dataTransfer?.types.includes(DRAG_TAB_MIME) === true) event.preventDefault()
  })

  host.addEventListener('drop', (event: DragEvent) => {
    takeDrop(event, scroller.children.length)
  })

  return {
    show(tabs: readonly ShownTab[], active: TabAt | null): void {
      const selected = active === null ? null : tabIdentity(active)
      const wanted = tabs.map((tab) => tabFor(tab, tabIdentity(tab) === selected))
      const open = new Set(wanted.map((element) => element.dataset.tab))

      for (const identity of [...drawn.keys()]) if (!open.has(identity)) drawn.delete(identity)
      scroller.replaceChildren(...wanted)
      reconsiderReach()
    },
  }
}
