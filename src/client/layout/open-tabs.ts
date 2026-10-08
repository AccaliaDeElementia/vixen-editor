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
  open: (at: TabAt) => TabAt | null
  keep: (at: TabAt) => TabAt | null
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
const LAST_TAB = -1
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

  function admit(at: TabAt, ephemeral: boolean): TabAt | null {
    const already = heldAt(at)
    if (already !== NOT_HELD) {
      if (!ephemeral) keepAt(already)
      current = at

      return null
    }

    const inTheWay = order.find((candidate) => candidate.ephemeral)
    const arriving: HeldTab = { ...at, ephemeral }
    current = at

    if (!ephemeral || inTheWay === undefined) {
      order.push(arriving)

      return null
    }

    order.splice(order.indexOf(inTheWay), ONE_TAB, arriving)

    return { path: inTheWay.path, view: inTheWay.view }
  }

  return {
    open: (at: TabAt) => admit(at, true),

    keep: (at: TabAt) => admit(at, false),

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
      if (current === null || tabIdentity(current) !== tabIdentity(at)) return

      const survivor = order[held] ?? order.at(LAST_TAB)
      current = survivor === undefined ? null : { path: survivor.path, view: survivor.view }
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
