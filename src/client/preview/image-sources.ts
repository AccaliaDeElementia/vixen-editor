'use sanity'

import { rawSourceFor } from '../platform/raw-sources.ts'

const NOTHING_NAMED = ''

export function pointImagesAtTheStore(rendered: ParentNode, holder: string): void {
  for (const image of rendered.querySelectorAll('img')) {
    const source = rawSourceFor(holder, image.getAttribute('src') ?? NOTHING_NAMED)
    if (source === null) continue

    image.setAttribute('src', source)
  }
}
