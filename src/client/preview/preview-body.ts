'use sanity'

const POSITIONED_SELECTOR = '[data-from]'

export interface PreviewBody {
  show: (content: string) => void
  revealOffset: (offset: number) => void
}

export function positionedBlocksIn(body: HTMLElement): HTMLElement[] {
  return [...body.querySelectorAll<HTMLElement>(POSITIONED_SELECTOR)]
}

export function blockAt(body: HTMLElement, offset: number): HTMLElement | null {
  let reached: HTMLElement | null = null

  for (const block of positionedBlocksIn(body)) {
    if (Number(block.dataset.from) <= offset) reached = block
  }

  return reached
}
