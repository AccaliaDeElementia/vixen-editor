'use sanity'

import { describe, expect, it, vi } from 'vitest'

import {
  onDeletionPending,
  settleBeforeDeleting,
  TestOnly,
} from '../../../../src/client/platform/announce/deletion-pending.ts'

const { DELETION_PENDING } = TestOnly

function host(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)

  return element
}

describe('asking whoever is editing to settle first', () => {
  it('tells the listener which entry is going', async () => {
    const root = host()
    const asked: string[] = []
    onDeletionPending(root, (entryPath): Promise<void> => {
      asked.push(entryPath)

      return Promise.resolve()
    })

    await settleBeforeDeleting(root, 'journal')

    expect(asked).toStrictEqual(['journal'])
  })

  it('waits for the work the listener hands back', async () => {
    const root = host()
    const order: string[] = []
    const settling = Promise.withResolvers<undefined>()
    onDeletionPending(root, async () => {
      await settling.promise
      order.push('settled')
    })

    const deleting = settleBeforeDeleting(root, 'journal').then(() => order.push('deleted'))
    settling.resolve(undefined)
    await deleting

    expect(order).toStrictEqual(['settled', 'deleted'])
  })

  it('goes ahead when nothing is listening, so a page without an editor is not held up', async () => {
    await expect(settleBeforeDeleting(host(), 'journal')).resolves.toBeUndefined()
  })

  it('goes ahead when the listener could not settle, because the save is best effort', async () => {
    const root = host()
    onDeletionPending(root, () => Promise.reject(new Error('offline')))

    await expect(settleBeforeDeleting(root, 'journal')).resolves.toBeUndefined()
  })

  it('stops asking once the listener is released', async () => {
    const root = host()
    const handle = vi.fn((): Promise<void> => Promise.resolve())
    const { offDeletionPending } = onDeletionPending(root, handle)

    offDeletionPending()
    await settleBeforeDeleting(root, 'journal')

    expect(handle).not.toHaveBeenCalled()
  })
})

describe('an event of the same name from somewhere else', () => {
  it('is not mistaken for a deletion to settle', () => {
    const root = host()
    const handle = vi.fn<(entryPath: string) => Promise<void>>()
    onDeletionPending(root, handle)

    root.dispatchEvent(new Event(DELETION_PENDING))

    expect(handle).not.toHaveBeenCalled()
  })
})
