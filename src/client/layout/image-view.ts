'use sanity'

import { rawUrlFor } from '../../shared/api.ts'
import { basenameOf } from '../../shared/link-paths.ts'

const PATH_SELECTOR = '#image-path'
const DOWNLOAD_SELECTOR = '#image-download'
const FILE_SELECTOR = '#image-file'

export interface ImageView {
  offer: (entryPath: string) => void
}

interface ImageViewOptions {
  root: ParentNode
  reveal: (at: string) => void
  onBroken: (entryPath: string) => void
}

interface Parts {
  path: HTMLElement
  download: HTMLAnchorElement
  file: HTMLImageElement
}

function partsOf(root: ParentNode): Parts | null {
  const path = root.querySelector<HTMLElement>(PATH_SELECTOR)
  const download = root.querySelector<HTMLAnchorElement>(DOWNLOAD_SELECTOR)
  const file = root.querySelector<HTMLImageElement>(FILE_SELECTOR)

  if (path === null || download === null || file === null) return null

  return { path, download, file }
}

const INERT: ImageView = {
  offer: () => undefined,
}

export function createImageView(options: ImageViewOptions): ImageView {
  const parts = partsOf(options.root)
  if (parts === null) return INERT

  const { path, download, file } = parts
  let showing = ''

  file.addEventListener('error', () => {
    options.onBroken(showing)
  })

  file.addEventListener('load', () => {
    options.reveal(showing)
  })

  return {
    offer(entryPath: string): void {
      showing = entryPath
      path.textContent = entryPath
      file.alt = entryPath
      download.href = rawUrlFor(entryPath)
      download.download = basenameOf(entryPath)
      file.src = rawUrlFor(entryPath)
    },
  }
}
