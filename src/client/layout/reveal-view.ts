'use sanity'

const VIEW_SELECTOR = '.view'

export function revealOnly(host: ParentNode, part: string): void {
  for (const section of host.querySelectorAll<HTMLElement>(VIEW_SELECTOR)) {
    section.hidden = section.dataset.part !== part
  }
}
