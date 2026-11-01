'use sanity'

import { basenameOf } from '../../../shared/link-paths.ts'
import { DRAG_MIME, DRAG_TAB_MIME } from '../../platform/drag-payload.ts'
import { decorativeIcon, ENTRY_GLYPHS } from '../../browser/tree/tree-rows.ts'
import { rovingFocus } from '../../platform/roving-focus.ts'
import type { TabView } from '../../platform/doc-path.ts'
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
const PAIR_CLASS = 'tabs__pair'
const EPHEMERAL_CLASS = 'tabs__tab--looking'
const CLOSE_CLASS = 'tabs__close'
const CLOSE_ICON_CLASS = 'icon tabs__close-icon'
const NAME_CLASS = 'tabs__name'
const KIND_CLASS = 'tabs__kind'
const NOTHING_DRAGGED = ''
const CLOSE_GLYPH = 'close'
const CLOSES = 'Close'
const IN_FRONT = 'aria-current'
const THE_ONE_IN_FRONT = 'true'
const DESCRIPTION = 'aria-description'
const NAMED = 'aria-label'
const EPHEMERAL_DESCRIPTION = 'closes when you open something else'
const WHILE_LOOKING = `— ${EPHEMERAL_DESCRIPTION}`
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

interface TabParts {
  pair: HTMLElement
  opener: HTMLElement
  closer: HTMLElement
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

export function tabNamed(at: TabAt): string {
  return sayingWhich(at.path, viewShownBy(at))
}

function shownAs(tab: ShownTab): string {
  return sayingWhich(labelFor(tab), viewShownBy(tab))
}

function titleFor(tab: ShownTab, looking: boolean): string {
  const named = sayingWhich(tab.path, viewShownBy(tab))

  return looking ? `${named} ${WHILE_LOOKING}` : named
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

  scroller.setAttribute('role', 'toolbar')
  rovingFocus(scroller)

  const drawn = new Map<string, TabParts>()

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
    const closer = document.createElement('button')
    closer.type = 'button'
    closer.className = CLOSE_CLASS
    closer.dataset.closes = tabIdentity(tab)
    closer.setAttribute(NAMED, `${CLOSES} ${shownAs(tab)}`)
    closer.append(decorativeIcon(CLOSE_GLYPH, CLOSE_ICON_CLASS))

    closer.addEventListener('click', () => {
      options.onClose(at)
    })

    return closer
  }

  function openerFor(tab: ShownTab, at: TabAt): HTMLElement {
    const opener = document.createElement('button')
    opener.type = 'button'
    opener.className = TAB_CLASS

    const { path, view } = at
    opener.dataset.tab = tabIdentity(tab)
    opener.dataset.path = path
    opener.dataset.view = view
    const name = document.createElement('span')
    name.className = NAME_CLASS
    name.textContent = labelFor(tab)
    const shows = viewShownBy(tab)
    opener.append(iconFor(view), name)

    if (shows !== null) {
      opener.append(kindFor(shows))
      opener.setAttribute(NAMED, shownAs(tab))
    }

    opener.addEventListener('click', () => {
      options.onActivate(at)
    })

    opener.addEventListener('dblclick', () => {
      options.onKeep(at)
    })

    opener.draggable = true

    opener.addEventListener('dragstart', (event: DragEvent) => {
      event.dataTransfer?.setData(DRAG_MIME, path)
      event.dataTransfer?.setData(DRAG_TAB_MIME, tabIdentity(tab))
    })

    return opener
  }

  function newPair(tab: ShownTab): TabParts {
    const at: TabAt = { path: tab.path, view: tab.view }
    const opener = openerFor(tab, at)
    const closer = closerFor(tab, at)

    const pair = document.createElement('span')
    pair.className = PAIR_CLASS
    pair.setAttribute('role', 'group')
    pair.append(opener, closer)

    pair.addEventListener('drop', (event: DragEvent) => {
      event.stopPropagation()
      takeDrop(event, [...scroller.children].indexOf(pair))
    })

    return { pair, opener, closer }
  }

  function pairFor(tab: ShownTab, active: boolean): HTMLElement {
    const identity = tabIdentity(tab)
    const parts = drawn.get(identity) ?? newPair(tab)
    drawn.set(identity, parts)

    const { pair, opener, closer } = parts
    opener.tabIndex = active ? REACHABLE : PASSED_OVER
    closer.tabIndex = PASSED_OVER
    if (active) opener.setAttribute(IN_FRONT, THE_ONE_IN_FRONT)
    else opener.removeAttribute(IN_FRONT)

    const looking = tab.ephemeral === true
    opener.title = titleFor(tab, looking)
    opener.classList.toggle(EPHEMERAL_CLASS, looking)
    if (looking) opener.setAttribute(DESCRIPTION, EPHEMERAL_DESCRIPTION)
    else opener.removeAttribute(DESCRIPTION)

    return pair
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
      const wanted = tabs.map((tab) => pairFor(tab, tabIdentity(tab) === selected))
      const open = new Set(tabs.map((tab) => tabIdentity(tab)))

      for (const identity of [...drawn.keys()]) if (!open.has(identity)) drawn.delete(identity)
      scroller.replaceChildren(...wanted)
      reconsiderReach()
    },
  }
}
