'use sanity'

import type { Extension } from '@codemirror/state'
import { closeHoverTooltips, hoverTooltip, keymap } from '@codemirror/view'
import type { EditorView, Tooltip } from '@codemirror/view'

import { docUrlFor } from '../doc-path.ts'

import { linkTargetAt } from './link-targets.ts'

const HOVER_DELAY_MS = 200
const TOOLTIP_CLASS = 'cm-vixen-link-tooltip'
const OPEN_CLASS = 'cm-vixen-link-tooltip__open'

function openingLink(target: string): HTMLElement {
  const dom = document.createElement('div')
  dom.className = TOOLTIP_CLASS

  const open = document.createElement('a')
  open.className = OPEN_CLASS
  open.href = docUrlFor(target)
  open.textContent = `Open ${target}`
  dom.append(open)

  return dom
}

function linkTooltipAt(view: EditorView, position: number): Tooltip | null {
  const found = linkTargetAt(view.state, position)
  if (found === null) return null

  const { markupFrom, markupTo, target } = found

  return {
    pos: markupFrom,
    end: markupTo,
    above: true,
    create: () => ({ dom: openingLink(target) }),
  }
}

const KEEPS_TRAVELLING = false

function dismissHoverTooltips(view: EditorView): boolean {
  view.dispatch({ effects: closeHoverTooltips })

  return KEEPS_TRAVELLING
}

export const vixenLinkTooltip: Extension = [
  hoverTooltip(linkTooltipAt, { hoverTime: HOVER_DELAY_MS }),
  keymap.of([{ key: 'Escape', run: dismissHoverTooltips }]),
]

export const TestOnly = { dismissHoverTooltips, linkTooltipAt }
