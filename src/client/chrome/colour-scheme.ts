'use sanity'

const LOCK_NAME = 'darkreader-lock'
const LOCK_SELECTOR = `meta[name="${LOCK_NAME}"]`

export function lockOutDarkening(into: ParentNode, dark = true): void {
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
