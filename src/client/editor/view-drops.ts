'use sanity'

import { DRAG_KIND_MIME, DRAG_MIME } from '../drag-payload.ts'
import { directoryOf } from '../../shared/link-paths.ts'

const VIEW_SELECTOR = '[data-part="view-markup"], [data-part="view-source"], [data-part="view-image"]'
const FOLDER_KIND = 'folder'
const FILES_TYPE = 'Files'

interface ViewDropOptions {
  holder: () => string | null
  open: (entryPath: string) => void
  upload: (files: readonly File[], directory: string) => void
}

function entryDropped(transfer: DataTransfer): string | null {
  const path = transfer.getData(DRAG_MIME)
  if (path === '') return null

  return transfer.getData(DRAG_KIND_MIME) === FOLDER_KIND ? `${path}/` : path
}

function carriesFiles(transfer: DataTransfer): boolean {
  return [...transfer.types].includes(FILES_TYPE)
}

function wanted(transfer: DataTransfer | null): transfer is DataTransfer {
  return transfer !== null && (entryDropped(transfer) !== null || carriesFiles(transfer))
}

export function bindViewDrops(host: ParentNode, options: ViewDropOptions): void {
  for (const view of host.querySelectorAll<HTMLElement>(VIEW_SELECTOR)) {
    view.addEventListener('dragover', (event: DragEvent) => {
      if (!wanted(event.dataTransfer)) return

      event.preventDefault()
    })

    view.addEventListener('drop', (event: DragEvent) => {
      if (!wanted(event.dataTransfer)) return

      event.preventDefault()
      const entry = entryDropped(event.dataTransfer)
      if (entry !== null) {
        options.open(entry)

        return
      }

      const holding = options.holder()
      if (holding === null) return

      options.upload([...event.dataTransfer.files], directoryOf(holding))
    })
  }
}
