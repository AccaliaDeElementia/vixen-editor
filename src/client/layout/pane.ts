'use sanity'

import type { EntryMove } from '../doc-path.ts'
import { readKeptTabs, writeKeptTabs, type PaneId } from './kept-tabs.ts'
import { createOpenTabs, tabFromIdentity, tabIdentity, type TabAt } from './open-tabs.ts'
import { createTabStrip } from './tab-strip.ts'

const STRIP_SELECTOR = '[data-part="tabs"]'
const NO_TABS = 0

interface PaneOptions {
  onActivate: (at: TabAt) => void
  onCloseRequested: (at: TabAt) => void
  onTabArrived: (identity: string, toIndex: number) => void
  onDisplaced: (at: TabAt) => void
}

export interface Pane {
  element: HTMLElement
  open: (at: TabAt) => void
  keep: (at: TabAt) => void
  close: (at: TabAt) => void
  receive: (at: TabAt, toIndex: number) => void
  keepWhenOpened: (at: TabAt) => void
  leave: () => void
  followMove: (move: EntryMove) => void
  holdsPermanently: (at: TabAt) => boolean
  held: () => readonly TabAt[]
  reorder: (at: TabAt, toIndex: number) => void
  showing: () => TabAt | null
  isEmpty: () => boolean
}

export function createPane(element: HTMLElement, id: PaneId, options: PaneOptions): Pane {
  const tabs = createOpenTabs()
  const host = element.querySelector<HTMLElement>(STRIP_SELECTOR)

  function draw(): void {
    strip?.show(tabs.all(), tabs.active())
  }

  function keptActive(): TabAt | null {
    const showing = tabs.active()
    if (showing === null) return null

    return tabs.kept().some((candidate) => tabIdentity(candidate) === tabIdentity(showing)) ? showing : null
  }

  function rememberAndDraw(): void {
    writeKeptTabs(id, tabs.kept(), keptActive())
    draw()
  }

  let awaited: string | null = null

  function keep(at: TabAt): void {
    tabs.keep(at)
    rememberAndDraw()
  }

  function close(at: TabAt): void {
    tabs.close(at)
    rememberAndDraw()
  }

  function dropped(identity: string, toIndex: number): void {
    const held = tabs.all().find((candidate) => tabIdentity(candidate) === identity)
    if (held === undefined) {
      options.onTabArrived(identity, toIndex)

      return
    }

    tabs.reorder(held, toIndex)
    rememberAndDraw()
  }

  function keepWhenOpened(at: TabAt): void {
    awaited = tabIdentity(at)
    tabs.promote(at)
    rememberAndDraw()
  }

  const strip =
    host === null
      ? null
      : createTabStrip(host, {
          onActivate: options.onActivate,
          onKeep: keep,
          onClose: options.onCloseRequested,
          onDropped: dropped,
        })

  const restored = readKeptTabs(id)
  for (const at of restored.tabs) tabs.keep(at)
  if (restored.active === null) tabs.leave()
  else tabs.keep(restored.active)
  draw()

  return {
    element,

    open(at: TabAt): void {
      const displaced = tabs.open(at)
      if (awaited === tabIdentity(at)) tabs.promote(at)
      awaited = null
      rememberAndDraw()
      if (displaced !== null) options.onDisplaced(displaced)
    },

    keep,
    keepWhenOpened,
    close,

    receive(at: TabAt, toIndex: number): void {
      tabs.keep(at)
      tabs.reorder(at, toIndex)
      rememberAndDraw()
    },

    leave(): void {
      tabs.leave()
      draw()
    },

    followMove(move: EntryMove): void {
      tabs.followMove(move)
      rememberAndDraw()
    },

    holdsPermanently: (at: TabAt) => tabs.kept().some((candidate) => tabIdentity(candidate) === tabIdentity(at)),

    held: () => tabs.all(),

    reorder(at: TabAt, toIndex: number): void {
      tabs.reorder(at, toIndex)
      rememberAndDraw()
    },

    showing: () => tabs.active(),

    isEmpty: () => tabs.all().length === NO_TABS,
  }
}

export function carryTab(identity: string, to: Pane, from: Pane | null, toIndex: number): TabAt | null {
  const at = tabFromIdentity(identity)
  if (at === null || from === null) return null

  from.close(at)
  to.receive(at, toIndex)

  return at
}
