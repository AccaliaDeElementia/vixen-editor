'use sanity'

const TRASH_EMPTIED = 'vixen:trash-emptied'

interface TrashEmptiedListener {
  offTrashEmptied: () => void
}

export function announceTrashEmptied(root: ParentNode): void {
  root.dispatchEvent(new Event(TRASH_EMPTIED, { bubbles: true }))
}

export function onTrashEmptied(root: ParentNode, handle: () => void): TrashEmptiedListener {
  const hear = (): void => {
    handle()
  }

  root.addEventListener(TRASH_EMPTIED, hear)

  return {
    offTrashEmptied: () => {
      root.removeEventListener(TRASH_EMPTIED, hear)
    },
  }
}

export const TestOnly = { TRASH_EMPTIED }
