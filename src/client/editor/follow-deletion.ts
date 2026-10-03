'use sanity'

import { onDeletionPending, onEntryTrashed } from '../entry-deletion.ts'
import { trashUrlFor } from '../../shared/page-urls.ts'
import { isAtOrUnder } from '../../shared/store-path.ts'

import type { Autosave } from './autosave.ts'

interface FollowOptions {
  root: ParentNode
  documentId: () => string
  autosave: Autosave
  openUrl: (url: string) => void
}

interface DeletionFollower {
  stopFollowingDeletion: () => void
}

export function followDeletion({ root, documentId, autosave, openUrl }: FollowOptions): DeletionFollower {
  const { offDeletionPending } = onDeletionPending(root, async (entryPath) => {
    if (isAtOrUnder(entryPath, documentId()) && autosave.state() !== 'clean') await autosave.flush()
  })

  const { offEntryTrashed } = onEntryTrashed(root, ({ entryPath, trashId }) => {
    if (isAtOrUnder(entryPath, documentId())) openUrl(trashUrlFor(trashId))
  })

  return {
    stopFollowingDeletion: () => {
      offDeletionPending()
      offEntryTrashed()
    },
  }
}
