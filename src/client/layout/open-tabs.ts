'use sanity'

import { pathAfterMove, TAB_VIEWS, type EntryMove, type TabView } from '../doc-path.ts'

export interface TabAt {
  path: string
  view: TabView
}

interface HeldTab extends TabAt {
  ephemeral: boolean
}

interface OpenTabs {
  open: (at: TabAt) => void
  keep: (at: TabAt) => void
  promote: (at: TabAt) => void
  close: (at: TabAt) => void
  reorder: (at: TabAt, toIndex: number) => void
  leave: () => void
  followMove: (move: EntryMove) => void
  all: () => readonly HeldTab[]
  kept: () => readonly TabAt[]
  active: () => TabAt | null
}

const NOT_HELD = -1
const ONE_TAB = 1
const FIRST_TAB = 0
const PAST_SEPARATOR = 1
const IDENTITY_SEPARATOR = ':'
const NO_PATH = ''

export function tabIdentity({ path, view }: TabAt): string {
  return `${view}${IDENTITY_SEPARATOR}${path}`
}

export function tabFromIdentity(identity: string): TabAt | null {
  const separator = identity.indexOf(IDENTITY_SEPARATOR)
  const view = TAB_VIEWS.find((candidate) => candidate === identity.slice(FIRST_TAB, separator))
  const path = identity.slice(separator + PAST_SEPARATOR)

  return view === undefined || path === NO_PATH ? null : { path, view }
}

export function createOpenTabs(): OpenTabs {
  const order: HeldTab[] = []
  let current: TabAt | null = null

  function heldAt(at: TabAt): number {
    const wanted = tabIdentity(at)

    return order.findIndex((candidate) => tabIdentity(candidate) === wanted)
  }

  function keepAt(index: number): void {
    const held: HeldTab | undefined = order[index]
    if (held !== undefined) order.splice(index, ONE_TAB, { ...held, ephemeral: false })
  }

  function admit(at: TabAt, ephemeral: boolean): void {
    const already = heldAt(at)
    if (already !== NOT_HELD) {
      if (!ephemeral) keepAt(already)
      current = at

      return
    }

    const displaced = order.findIndex((candidate) => candidate.ephemeral)
    const arriving: HeldTab = { ...at, ephemeral }

    if (ephemeral && displaced !== NOT_HELD) order.splice(displaced, ONE_TAB, arriving)
    else order.push(arriving)

    current = at
  }

  return {
    open(at: TabAt): void {
      admit(at, true)
    },

    keep(at: TabAt): void {
      admit(at, false)
    },

    promote(at: TabAt): void {
      keepAt(heldAt(at))
    },

    reorder(at: TabAt, toIndex: number): void {
      const wanted = tabIdentity(at)
      const moving = order.filter((candidate) => tabIdentity(candidate) === wanted)
      const rest = order.filter((candidate) => tabIdentity(candidate) !== wanted)

      order.splice(FIRST_TAB, order.length, ...rest.slice(FIRST_TAB, toIndex), ...moving, ...rest.slice(toIndex))
    },

    close(at: TabAt): void {
      const held = heldAt(at)
      if (held === NOT_HELD) return

      order.splice(held, ONE_TAB)
      if (current !== null && tabIdentity(current) === tabIdentity(at)) current = null
    },

    leave(): void {
      current = null
    },

    followMove(move: EntryMove): void {
      order.splice(FIRST_TAB, order.length, ...order.map((held) => ({ ...held, path: pathAfterMove(move, held.path) })))
      if (current !== null) current = { ...current, path: pathAfterMove(move, current.path) }
    },

    all: () => order,
    kept: () => order.filter((held) => !held.ephemeral).map(({ path, view }) => ({ path, view })),
    active: () => current,
  }
}
