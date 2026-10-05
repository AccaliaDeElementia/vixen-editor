'use sanity'

interface FreshnessOptions {
  check: () => Promise<void>
  listen?: ((wake: () => void, settled: () => Promise<void>) => () => void) | undefined
}

interface FreshnessWatcher {
  unwatchFreshness: () => void
  recheck: () => Promise<void>
}

function onTabFocus(wake: () => void): () => void {
  const onVisible = (): void => {
    if (document.visibilityState === 'visible') wake()
  }

  window.addEventListener('focus', wake)
  document.addEventListener('visibilitychange', onVisible)

  return () => {
    window.removeEventListener('focus', wake)
    document.removeEventListener('visibilitychange', onVisible)
  }
}

export function watchFreshness(options: FreshnessOptions): FreshnessWatcher {
  const listen = options.listen ?? onTabFocus
  let inFlight: Promise<void> | null = null

  const wake = (): void => {
    inFlight ??= options.check().finally(() => {
      inFlight = null
    })
  }

  const settled = async (): Promise<void> => {
    await (inFlight ?? Promise.resolve())
  }

  const unlisten = listen(wake, settled)

  return {
    unwatchFreshness: unlisten,
    recheck: async () => {
      wake()
      await settled()
    },
  }
}
