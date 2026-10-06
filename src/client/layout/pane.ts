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
  showing: () => TabAt | null
  isEmpty: () => boolean
}

export function createPane(element: HTMLElement, id: PaneId, options: PaneOptions): Pane {
  const tabs = createOpenTabs()
  const host = element.querySelector<HTMLElement>(STRIP_SELECTOR)

  function draw(): void {
    strip?.show(tabs.all(), tabs.active())
  }

  function rememberAndDraw(): void {
    writeKeptTabs(id, tabs.kept())
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

  for (const at of readKeptTabs(id)) tabs.keep(at)
  tabs.leave()
  draw()

  return {
    element,

    open(at: TabAt): void {
      tabs.open(at)
      if (awaited === tabIdentity(at)) tabs.promote(at)
      awaited = null
      rememberAndDraw()
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

    holdsPermanently: (at: TabAt) => tabs.kept().some((held) => tabIdentity(held) === tabIdentity(at)),

    showing: () => tabs.active(),

    isEmpty: () => tabs.all().length === NO_TABS,
  }
}

export function carryTab(identity: string, to: Pane, from: Pane | null, toIndex: number): void {
  const at = tabFromIdentity(identity)
  if (at === null || from === null) return

  from.close(at)
  to.receive(at, toIndex)
}
