'use sanity'

export interface Gate {
  open: () => void
  hold: () => Promise<void>
}

// A promise the test settles by hand, so a concurrency test controls exactly
// when an operation finishes rather than guessing at a number of milliseconds.
export function gate(): Gate {
  let open = (): void => undefined

  /* eslint-disable-next-line promise/avoid-new -- a gate is a deferred settled
     by a later call in a different frame; every composition this rule prefers
     needs the promise to already exist, which is the thing being created */
  const held = new Promise<void>((resolve) => {
    open = () => {
      resolve()
    }
  })

  return {
    open: () => {
      open()
    },
    hold: () => held,
  }
}
