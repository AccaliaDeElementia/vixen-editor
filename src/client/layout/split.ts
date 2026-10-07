'use sanity'

import { isRecord } from '../../shared/guards.ts'
import { readJson, writeJson } from '../local-storage.ts'

export type SplitOrientation = 'beside' | 'below'

interface SplitState {
  orientation: SplitOrientation | null
  fraction: number
}

type Shares = Record<SplitOrientation, number>

interface StoredSplit {
  orientation: SplitOrientation | null
  shares: Shares
}

const SPLIT_KEY = 'vixen-editor:split'
const ORIENTATIONS = ['beside', 'below'] as const
const EVEN_SPLIT = 0.5
const NONE_OF_THE_AXIS = 0
const ALL_OF_THE_AXIS = 100
const MIN_PANE_WIDTH_PX = 280
const MIN_PANE_HEIGHT_PX = 160
const BOTH_PANES = 2
const WHOLE = 1

const PANES_SELECTOR = '[data-part="panes"]'
const RESIZER_SELECTOR = '[data-part="split-resizer"]'
const PANE_SELECTOR = '.pane'
const SECOND_PANE_TEMPLATE_SELECTOR = 'template[data-part="second-pane"]'
const ONE_PANE = 1

const EVEN_BOTH_WAYS: Shares = { beside: EVEN_SPLIT, below: EVEN_SPLIT }
const SINGLE_PANE: StoredSplit = { orientation: null, shares: EVEN_BOTH_WAYS }

function isOrientation(value: unknown): value is SplitOrientation {
  return ORIENTATIONS.some((candidate) => candidate === value)
}

function shareIn(held: unknown, orientation: SplitOrientation): number {
  if (!isRecord(held)) return EVEN_SPLIT

  const { [orientation]: share } = held

  return typeof share === 'number' && Number.isFinite(share) ? share : EVEN_SPLIT
}

function storedSplit(storage?: Storage | null): StoredSplit {
  const stored = readJson(SPLIT_KEY, storage)
  if (!isRecord(stored)) return SINGLE_PANE

  const { orientation, shares } = stored

  return {
    orientation: isOrientation(orientation) ? orientation : null,
    shares: { beside: shareIn(shares, 'beside'), below: shareIn(shares, 'below') },
  }
}

export function readSplit(storage?: Storage | null): SplitState {
  const { orientation, shares } = storedSplit(storage)

  return { orientation, fraction: orientation === null ? EVEN_SPLIT : shares[orientation] }
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

interface Painted {
  panes: HTMLElement
  resizer: HTMLElement
}

function paintableIn(root: ParentNode): Painted | null {
  const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)
  const resizer = panes?.querySelector<HTMLElement>(RESIZER_SELECTOR) ?? null
  if (panes === null || resizer === null) return null

  return { panes, resizer }
}

function paint(painted: Painted, orientation: SplitOrientation | null, fraction: number, axisPx: number): void {
  const { panes, resizer } = painted
  const shown = orientation === null ? EVEN_SPLIT : clampFraction(fraction, axisPx, orientation)

  panes.style.setProperty('--split', String(shown))
  resizer.setAttribute('aria-orientation', orientation === 'below' ? 'horizontal' : 'vertical')
  const across = Math.round(shown * ALL_OF_THE_AXIS)

  resizer.setAttribute('aria-valuemin', String(NONE_OF_THE_AXIS))
  resizer.setAttribute('aria-valuemax', String(ALL_OF_THE_AXIS))
  resizer.setAttribute('aria-valuenow', String(across))
  resizer.setAttribute('aria-valuetext', `${String(across)} percent`)
}

export function applySplit(root: ParentNode, axisPx: number): void {
  const painted = paintableIn(root)
  if (painted === null) return

  const { orientation, fraction } = readSplit()

  if (orientation === null) {
    delete painted.panes.dataset.split
    removeSecondPane(painted.panes)
  } else {
    painted.panes.dataset.split = orientation
    addSecondPane(painted.panes)
  }

  paint(painted, orientation, fraction, axisPx)
}

export function showSplitFraction(painted: Painted, fraction: number, axisPx: number): void {
  const { orientation } = readSplit()
  if (orientation === null) return

  paint(painted, orientation, fraction, axisPx)
}

function write(state: StoredSplit): void {
  writeJson(SPLIT_KEY, state)
}

export function closeSplit(root: ParentNode, axisPx: number): void {
  write(SINGLE_PANE)
  applySplit(root, axisPx)
}

export function toggleSplit(root: ParentNode, orientation: SplitOrientation, axisPx: number): void {
  const { orientation: current, shares } = storedSplit()
  if (current === orientation) {
    closeSplit(root, axisPx)

    return
  }

  write({ orientation, shares })
  applySplit(root, axisPx)
}

export function openSplit(root: ParentNode, orientation: SplitOrientation, axisPx: number): void {
  const { orientation: current, shares } = storedSplit()
  if (current === null) write({ orientation, shares })

  applySplit(root, axisPx)
}

export function secondPaneIn(root: ParentNode): HTMLElement | null {
  const panes = root.querySelector<HTMLElement>(PANES_SELECTOR)

  return panes === null ? null : secondPaneOf(panes)
}

export function setSplitFraction(root: ParentNode, fraction: number, axisPx: number): void {
  const { orientation, shares } = storedSplit()
  if (orientation === null) return

  write({ orientation, shares: { ...shares, [orientation]: clampFraction(fraction, axisPx, orientation) } })
  applySplit(root, axisPx)
}

export const TestOnly = { EVEN_SPLIT, MIN_PANE_WIDTH_PX, MIN_PANE_HEIGHT_PX, SPLIT_KEY }
