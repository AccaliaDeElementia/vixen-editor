'use sanity'

type TabView = 'editor' | 'source' | 'markup'

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
  leave: () => void
  all: () => readonly HeldTab[]
  active: () => TabAt | null
}

const NOT_HELD = -1
const ONE_TAB = 1

export function tabIdentity({ path, view }: TabAt): string {
  return `${view}:${path}`
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

    leave(): void {
      current = null
    },

    all: () => order,
    active: () => current,
  }
}
