'use sanity'

const CHECK_INTERVAL_MS = 60_000

interface FreshnessOptions {
  check: () => Promise<void>
  intervalMs?: number | undefined
  listen?: ((wake: () => void) => () => void) | undefined
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

export function watchFreshness(options: FreshnessOptions): () => void {
  const listen = options.listen ?? onTabFocus
  let inFlight: Promise<void> | null = null

  const wake = (): void => {
    inFlight ??= options.check().finally(() => {
      inFlight = null
    })
  }

  const timer = setInterval(wake, options.intervalMs ?? CHECK_INTERVAL_MS)
  const unlisten = listen(wake)

  return () => {
    clearInterval(timer)
    unlisten()
  }
}

export const TestOnly = { CHECK_INTERVAL_MS }
