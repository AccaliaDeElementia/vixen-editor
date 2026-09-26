'use sanity'

export interface Gate {
  open: () => void
  hold: () => Promise<void>
}

export function gate(): Gate {
  const held: PromiseWithResolvers<void> = Promise.withResolvers()

  return {
    open: () => {
      held.resolve()
    },
    hold: () => held.promise,
  }
}
