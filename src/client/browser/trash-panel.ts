'use sanity'

import { announceTrashEmptied } from '../platform/trash-emptied.ts'
import { errorMessage } from '../platform/error-message.ts'
import type { Dialogs } from '../platform/dialogs.ts'
import type { Toast } from '../platform/toast.ts'

import type { FilesClient } from './files-client.ts'

const EMPTY_TRASH_SELECTOR = '#empty-trash'
const TRASH_EMPTY_SELECTOR = '[data-part="trash-empty"]'
const NOTHING_DELETED = 0
const ONE_ENTRY = 1

interface TrashPanelOptions {
  root: ParentNode
  client: FilesClient
  dialogs: Dialogs
  toast: Toast
  held: () => number
  reload: () => Promise<void>
  track: (work: Promise<void>) => void
}

interface TrashPanel {
  paint: () => void
  bind: () => void
}

function entriesIn(count: number): string {
  return `${String(count)} ${count === ONE_ENTRY ? 'entry' : 'entries'}`
}

export function createTrashPanel(options: TrashPanelOptions): TrashPanel {
  const { root, client, dialogs, toast } = options

  function emptyTrashControl(): HTMLElement | null {
    return root.querySelector<HTMLElement>(EMPTY_TRASH_SELECTOR)
  }

  function paint(): void {
    const nothing = options.held() === NOTHING_DELETED
    const placeholder = root.querySelector<HTMLElement>(TRASH_EMPTY_SELECTOR)
    if (placeholder !== null) placeholder.hidden = !nothing

    const button = emptyTrashControl()
    if (button === null) return

    button.hidden = nothing
    button.setAttribute('aria-label', `Empty the trash of ${entriesIn(options.held())}`)
  }

  async function emptyTrash(): Promise<void> {
    toast.show(`Deleted ${entriesIn(await client.emptyTrash())} for good`)
    announceTrashEmptied(root)
    await options.reload()
  }

  async function emptyTrashOnceAsked(): Promise<void> {
    const held = entriesIn(options.held())
    const confirmed = await dialogs.confirm({
      title: 'Empty the trash',
      message: `${held} will be deleted for good, and cannot be restored afterwards.`,
      confirmLabel: 'Delete for good',
    })
    if (!confirmed) return

    await emptyTrash()
  }

  return {
    paint,

    bind: () => {
      emptyTrashControl()?.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()

        options.track(
          emptyTrashOnceAsked().catch((error: unknown) => {
            toast.error(errorMessage(error))
          }),
        )
      })
    },
  }
}
