'use sanity'

import { headingsOf, type Heading } from '../../shared/markdown-tree.ts'
import { OUTLINE_PANEL, panelShowing } from '../platform/panels.ts'
import { readPreferences, writePreferences } from '../platform/preferences.ts'

const LIST_SELECTOR = '[data-part="outline-list"]'
const EMPTY_SELECTOR = '[data-part="outline-empty"]'
const QUOTED_SELECTOR = '[data-part="outline-quoted"]'

const OUTLINE_SETTLES_MS = 200

const NOTHING_OPEN = 'Nothing is open.'
const NO_HEADINGS = 'This document has no headings.'
const ONLY_QUOTED_HEADINGS = 'Every heading here is inside a quote.'
const NOTHING_TO_SAY = ''

const TOP_LEVEL = 1
const NONE = 0
const NOTHING_SHOWN = ''

interface OutlineOptions {
  root: ParentNode
  source: () => string | null
  chosen: (offset: number) => void
}

interface Outline {
  show: () => void
  refreshSoon: () => void
  stop: () => void
}

function rowFor({ level, text, from }: Heading, chosen: (offset: number) => void): HTMLElement {
  const row = document.createElement('li')
  const jump = document.createElement('button')
  jump.type = 'button'
  jump.className = 'outline__row'
  jump.style.setProperty('--depth', String(level - TOP_LEVEL))
  jump.textContent = text
  jump.addEventListener('click', () => {
    chosen(from)
  })
  row.append(jump)

  return row
}

function emptyMessage(markdown: string | null, held: readonly Heading[], listed: readonly Heading[]): string {
  if (markdown === null) return NOTHING_OPEN
  if (listed.length > NONE) return NOTHING_TO_SAY

  return held.length === NONE ? NO_HEADINGS : ONLY_QUOTED_HEADINGS
}

function signatureOf(said: string, headings: readonly Heading[]): string {
  const held = headings.map(({ level, text, from }) => `${String(level)} ${String(from)} ${text}`).join('\n')

  return `${said}\n${held}`
}

export function createOutline(options: OutlineOptions): Outline {
  const { root, chosen } = options

  let shown = NOTHING_SHOWN
  let settling: ReturnType<typeof setTimeout> | null = null

  function stop(): void {
    if (settling !== null) clearTimeout(settling)
    settling = null
  }

  function show(): void {
    if (panelShowing(root) !== OUTLINE_PANEL) return

    const list = root.querySelector<HTMLElement>(LIST_SELECTOR)
    const empty = root.querySelector<HTMLElement>(EMPTY_SELECTOR)
    if (list === null || empty === null) return

    const markdown = options.source()
    const held = markdown === null ? [] : headingsOf(markdown)
    const headings = readPreferences().quotedHeadings ? held : held.filter((heading) => !heading.quoted)
    const said = emptyMessage(markdown, held, headings)
    const signature = signatureOf(said, headings)

    if (signature === shown) return

    shown = signature
    list.replaceChildren(...headings.map((heading) => rowFor(heading, chosen)))
    empty.textContent = said
    empty.hidden = headings.length > NONE
  }

  function markQuotedAsked(toggle: Element, asked: boolean): void {
    toggle.setAttribute('aria-pressed', String(asked))
  }

  function bindQuotedToggle(): void {
    const toggle = root.querySelector<HTMLElement>(QUOTED_SELECTOR)
    if (toggle === null) return

    markQuotedAsked(toggle, readPreferences().quotedHeadings)
    toggle.addEventListener('click', () => {
      const asked = !readPreferences().quotedHeadings
      writePreferences({ ...readPreferences(), quotedHeadings: asked })
      markQuotedAsked(toggle, asked)
      show()
    })
  }

  bindQuotedToggle()

  return {
    show,
    stop,

    refreshSoon(): void {
      stop()
      settling = setTimeout(show, OUTLINE_SETTLES_MS)
    },
  }
}

export const TestOnly = { OUTLINE_SETTLES_MS }
