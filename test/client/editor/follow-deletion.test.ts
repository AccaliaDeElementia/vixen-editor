'use sanity'

import { describe, expect, it, vi } from 'vitest'

import type { Autosave, SaveState } from '../../../src/client/editor/autosave.ts'
import { followDeletion } from '../../../src/client/editor/follow-deletion.ts'
import { announceEntryTrashed, settleBeforeDeleting } from '../../../src/client/entry-deletion.ts'
import { cast } from '../../cast.ts'

const OPEN = 'journal/a.md'

interface Following {
  root: HTMLElement
  flushed: ReturnType<typeof vi.fn>
  opened: string[]
  stopFollowingDeletion: () => void
}

function following(state: SaveState = 'pending', open = OPEN): Following {
  const root = document.createElement('div')
  document.body.append(root)

  const flushed = vi.fn((): Promise<void> => Promise.resolve())
  const opened: string[] = []
  const autosave = cast<Autosave>({ flush: flushed, state: () => state })

  const { stopFollowingDeletion } = followDeletion({
    root,
    documentId: () => open,
    autosave,
    openUrl: (url: string) => {
      opened.push(url)
    },
  })

  return { root, flushed, opened, stopFollowingDeletion }
}

describe('settling before the entry goes', () => {
  it('saves the open document when it is the one being deleted', async () => {
    const { root, flushed } = following()

    await settleBeforeDeleting(root, OPEN)

    expect(flushed).toHaveBeenCalledTimes(1)
  })

  it('saves it when a folder holding it is deleted', async () => {
    const { root, flushed } = following()

    await settleBeforeDeleting(root, 'journal')

    expect(flushed).toHaveBeenCalledTimes(1)
  })

  it('leaves a delete elsewhere in the store alone', async () => {
    const { root, flushed } = following()

    await settleBeforeDeleting(root, 'archive')

    expect(flushed).not.toHaveBeenCalled()
  })

  it('leaves a sibling whose name merely starts the same alone', async () => {
    const { root, flushed } = following()

    await settleBeforeDeleting(root, 'journal-archive')

    expect(flushed).not.toHaveBeenCalled()
  })

  it('has nothing to save when the buffer is already clean', async () => {
    const { root, flushed } = following('clean')

    await settleBeforeDeleting(root, OPEN)

    expect(flushed).not.toHaveBeenCalled()
  })

  it('still settles once the follower is released', async () => {
    const { root, flushed, stopFollowingDeletion } = following()

    stopFollowingDeletion()
    await settleBeforeDeleting(root, OPEN)

    expect(flushed).not.toHaveBeenCalled()
  })
})

describe('following the document to the trash', () => {
  it('opens the entry the document became', () => {
    const { root, opened } = following()

    announceEntryTrashed(root, { entryPath: OPEN, trashId: 'abc-123' })

    expect(opened).toStrictEqual(['/trash/abc-123'])
  })

  it('opens it when a folder holding the document was deleted', () => {
    const { root, opened } = following()

    announceEntryTrashed(root, { entryPath: 'journal', trashId: 'abc-123' })

    expect(opened).toStrictEqual(['/trash/abc-123'])
  })

  it('stays put when something else was deleted', () => {
    const { root, opened } = following()

    announceEntryTrashed(root, { entryPath: 'archive/old.md', trashId: 'abc-123' })

    expect(opened).toStrictEqual([])
  })

  it('stays put once the follower is released', () => {
    const { root, opened, stopFollowingDeletion } = following()

    stopFollowingDeletion()
    announceEntryTrashed(root, { entryPath: OPEN, trashId: 'abc-123' })

    expect(opened).toStrictEqual([])
  })
})
