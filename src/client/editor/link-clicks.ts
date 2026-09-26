'use sanity'

import { directoryOf, resolveDestination } from '../../shared/link-paths.ts'

const LINK_SELECTOR = '.cm-vixen-link'
const DESTINATION_ATTRIBUTE = 'data-destination'

interface LinkClickOptions {
  holder: () => string
  open: (entryPath: string) => void
}

function destinationUnder(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null

  return target.closest(LINK_SELECTOR)?.getAttribute(DESTINATION_ATTRIBUTE) ?? null
}

function opensInThisTab(event: MouseEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey
}

export function bindLinkClicks(content: HTMLElement, options: LinkClickOptions): void {
  content.addEventListener('click', (event) => {
    if (!opensInThisTab(event)) return

    const destination = destinationUnder(event.target)
    if (destination === null) return

    const target = resolveDestination(directoryOf(options.holder()), destination)
    if (target === null) return

    event.preventDefault()
    options.open(target)
  })
}
