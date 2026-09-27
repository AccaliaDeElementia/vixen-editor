'use sanity'

import type { Extension, Transaction } from '@codemirror/state'
import { activateHover, closeHoverTooltips, EditorView, hoverTooltip, keymap } from '@codemirror/view'
import type { Tooltip } from '@codemirror/view'

import { docUrlFor } from '../doc-path.ts'

import { linkTargetAt } from './link-targets.ts'

const HOVER_DELAY_MS = 200
const TOUCH = 'touch'
const AFTER_THE_POSITION = 1
const LEFT_FOR_OTHERS = false
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

const linkHover = hoverTooltip(linkTooltipAt, { hoverTime: HOVER_DELAY_MS })

function outside(position: number, from: number, to: number): boolean {
  return position < from || position > to
}

function whenTheCaretLeaves(from: number, to: number): (transaction: Transaction) => boolean {
  return (transaction) => {
    if (transaction.docChanged) return true
    if (transaction.selection === undefined) return false

    return outside(transaction.state.selection.main.head, from, to)
  }
}

function revealOnTap(event: PointerEvent, view: EditorView): boolean {
  if (event.pointerType !== TOUCH) return LEFT_FOR_OTHERS

  const position = view.posAtCoords({ x: event.clientX, y: event.clientY })
  if (position === null) return LEFT_FOR_OTHERS

  const found = linkTargetAt(view.state, position)
  if (found === null) return LEFT_FOR_OTHERS

  activateHover(view, position, AFTER_THE_POSITION, {
    tooltip: linkHover,
    until: whenTheCaretLeaves(found.markupFrom, found.markupTo),
  })

  return LEFT_FOR_OTHERS
}

export const vixenLinkTooltip: Extension = [
  linkHover,
  keymap.of([{ key: 'Escape', run: dismissHoverTooltips }]),
  EditorView.domEventHandlers({ pointerup: revealOnTap }),
]

export const TestOnly = { dismissHoverTooltips, linkTooltipAt, revealOnTap, whenTheCaretLeaves }
