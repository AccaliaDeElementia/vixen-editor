'use sanity'

type TabView = 'editor' | 'source' | 'markup'

export interface TabAt {
  path: string
  view: TabView
}

interface OpenTabs {
  open: (at: TabAt) => void
  leave: () => void
  all: () => readonly TabAt[]
  active: () => TabAt | null
}

export function tabIdentity({ path, view }: TabAt): string {
  return `${view}:${path}`
}

export function createOpenTabs(): OpenTabs {
  const order: TabAt[] = []
  let current: TabAt | null = null

  function holds(at: TabAt): boolean {
    const wanted = tabIdentity(at)

    return order.some((candidate) => tabIdentity(candidate) === wanted)
  }

  return {
    open(at: TabAt): void {
      if (!holds(at)) order.push(at)
      current = at
    },

    leave(): void {
      current = null
    },

    all: () => order,
    active: () => current,
  }
}
