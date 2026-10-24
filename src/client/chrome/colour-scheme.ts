'use sanity'

const LOCK_NAME = 'darkreader-lock'
const LOCK_SELECTOR = `meta[name="${LOCK_NAME}"]`
const LIGHT_QUERY = '(prefers-color-scheme: light)'

function lockOutDarkening(into: ParentNode, dark: boolean): void {
  const already = into.querySelector(LOCK_SELECTOR)
  if (!dark) {
    already?.remove()

    return
  }
  if (already !== null) return

  const lock = document.createElement('meta')
  lock.name = LOCK_NAME
  into.append(lock)
}

export function followColourScheme(view: Window, head: ParentNode): () => void {
  const light = view.matchMedia(LIGHT_QUERY)
  const applyLock = (): void => {
    lockOutDarkening(head, !light.matches)
  }

  applyLock()
  light.addEventListener('change', applyLock)

  return () => {
    light.removeEventListener('change', applyLock)
  }
}
