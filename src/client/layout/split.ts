'use sanity'

import { isRecord } from '../../shared/guards.ts'
import { readJson, writeJson } from '../local-storage.ts'

export type SplitOrientation = 'beside' | 'below'

interface SplitState {
  orientation: SplitOrientation | null
  fraction: number
}

const SPLIT_KEY = 'vixen-editor:split'
const ORIENTATIONS = ['beside', 'below'] as const
const EVEN_SPLIT = 0.5
const MIN_PANE_WIDTH_PX = 280
const MIN_PANE_HEIGHT_PX = 160
const BOTH_PANES = 2
const WHOLE = 1

const PANES_SELECTOR = '[data-part="panes"]'
const RESIZER_SELECTOR = '[data-part="split-resizer"]'
const PANE_SELECTOR = '.pane'
const SECOND_PANE_TEMPLATE_SELECTOR = 'template[data-part="second-pane"]'
const ONE_PANE = 1

const SINGLE_PANE: SplitState = { orientation: null, fraction: EVEN_SPLIT }

function isOrientation(value: unknown): value is SplitOrientation {
  return ORIENTATIONS.some((candidate) => candidate === value)
}

export function readSplit(storage?: Storage | null): SplitState {
  const stored = readJson(SPLIT_KEY, storage)
  if (!isRecord(stored)) return SINGLE_PANE

  const { orientation, fraction } = stored

  return {
    orientation: isOrientation(orientation) ? orientation : null,
    fraction: typeof fraction === 'number' && Number.isFinite(fraction) ? fraction : EVEN_SPLIT,
  }
}

function floorFor(orientation: SplitOrientation): number {
  return orientation === 'beside' ? MIN_PANE_WIDTH_PX : MIN_PANE_HEIGHT_PX
}

function clampFraction(fraction: number, axisPx: number, orientation: SplitOrientation): number {
  const floor = floorFor(orientation)
  if (axisPx < floor * BOTH_PANES) return EVEN_SPLIT

  const smallest = floor / axisPx

  return Math.min(Math.max(fraction, smallest), WHOLE - smallest)
}

function secondPaneOf(panes: HTMLElement): HTMLElement | null {
  const { [ONE_PANE]: second } = panes.querySelectorAll<HTMLElement>(PANE_SELECTOR)

  return second ?? null
}

function addSecondPane(panes: HTMLElement): void {
  const template = panes.querySelector<HTMLTemplateElement>(SECOND_PANE_TEMPLATE_SELECTOR)
  if (template === null || secondPaneOf(panes) !== null) return

  panes.append(template.content.cloneNode(true))
}

function removeSecondPane(panes: HTMLElement): void {
  secondPaneOf(panes)?.remove()
}

export function applySplit(root: ParentNode, axisPx: number): void {
  const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)
  const resizer = panes?.querySelector<HTMLElement>(RESIZER_SELECTOR) ?? null
  if (panes === null || resizer === null) return

  const { orientation, fraction } = readSplit()

  if (orientation === null) {
    delete panes.dataset.split
    removeSecondPane(panes)
  } else {
    panes.dataset.split = orientation
    addSecondPane(panes)
  }

  panes.style.setProperty(
    '--split',
    String(orientation === null ? EVEN_SPLIT : clampFraction(fraction, axisPx, orientation)),
  )
  resizer.setAttribute('aria-orientation', orientation === 'below' ? 'horizontal' : 'vertical')
}

function write(state: SplitState): void {
  writeJson(SPLIT_KEY, state)
}

export function toggleSplit(root: ParentNode, orientation: SplitOrientation, axisPx: number): void {
  const current = readSplit()
  const closing = current.orientation === orientation

  write(closing ? SINGLE_PANE : { orientation, fraction: current.fraction })
  applySplit(root, axisPx)
}

export function openSplit(root: ParentNode, orientation: SplitOrientation, axisPx: number): void {
  const { orientation: current, fraction } = readSplit()
  if (current === null) write({ orientation, fraction })

  applySplit(root, axisPx)
}

export function secondPaneIn(root: ParentNode): HTMLElement | null {
  const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)

  return panes === null ? null : secondPaneOf(panes)
}

export function setSplitFraction(root: ParentNode, fraction: number, axisPx: number): void {
  const { orientation } = readSplit()
  if (orientation === null) return

  write({ orientation, fraction: clampFraction(fraction, axisPx, orientation) })
  applySplit(root, axisPx)
}

export const TestOnly = { EVEN_SPLIT, MIN_PANE_WIDTH_PX, MIN_PANE_HEIGHT_PX, SPLIT_KEY }
