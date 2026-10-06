'use sanity'

import type { EntryMove } from '../doc-path.ts'
import { readKeptTabs, writeKeptTabs, type PaneId } from './kept-tabs.ts'
import { createOpenTabs, tabIdentity, type TabAt } from './open-tabs.ts'
import { createTabStrip } from './tab-strip.ts'

const STRIP_SELECTOR = '[data-part="tabs"]'

interface PaneOptions {
  onActivate: (at: TabAt) => void
}

export interface Pane {
  element: HTMLElement
  open: (at: TabAt) => void
  keep: (at: TabAt) => void
  keepWhenOpened: (at: TabAt) => void
  leave: () => void
  followMove: (move: EntryMove) => void
  holdsPermanently: (at: TabAt) => boolean
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

    leave(): void {
      tabs.leave()
      draw()
    },

    followMove(move: EntryMove): void {
      tabs.followMove(move)
      rememberAndDraw()
    },

    holdsPermanently: (at: TabAt) => tabs.kept().some((held) => tabIdentity(held) === tabIdentity(at)),
  }
}
