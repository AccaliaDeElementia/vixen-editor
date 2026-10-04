'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { announceStoreChanged } from '../../../../src/client/store-changed.ts'
import { parseTree } from '../../../../src/client/files/tree-model.ts'
import { EMPTY_TRASH_SELECTOR, TRASH_PATH } from '../../../../src/client/files/tree-view.ts'
import type { FilesClient } from '../../../../src/client/files/files-client.ts'
import { cast } from '../../../cast.ts'
import { given } from '../../../conditions.ts'
import { TRASHED, fakeClient, mountTree, rowFor, statusText, treePage } from '../../tree-fixtures.ts'

const SAMPLE = parseTree({ tree: [{ name: 'notes.md', path: 'notes.md', kind: 'document' }] })

let host: HTMLElement = document.createElement('div')
let client = fakeClient(SAMPLE, [TRASHED])
let settled: () => Promise<void> = () => Promise.resolve()

async function start(trash = [TRASHED, { ...TRASHED, id: 'bbbb' }]): Promise<void> {
  client = fakeClient(SAMPLE, trash)
  settled = await mountTree({ root: host, pathname: '/doc/', client: cast<FilesClient>(client) })
}

function control(): HTMLButtonElement {
  const button = rowFor(TRASH_PATH).querySelector<HTMLButtonElement>(EMPTY_TRASH_SELECTOR)
  if (button === null) throw new Error('the trash offers no way to empty it')

  return button
}

beforeEach(() => {
  localStorage.clear()
  host = treePage()
})

describe('asking to empty the trash', () => {
  it('does nothing on the first click, because the second is the confirmation', async () => {
    await start()

    control().click()

    expect(client.emptyTrash).not.toHaveBeenCalled()
  })

  it('says what a second click would cost', async () => {
    await start()

    control().click()

    expect(control().textContent).toBe('Delete 2 entries for good')
  })

  it('leaves the trash closed, so confirming is not also a navigation', async () => {
    await start()

    control().click()

    expect(rowFor(TRASH_PATH).getAttribute('aria-expanded')).toBe('false')
  })

  it('empties it on the second click', async () => {
    await start()
    control().click()

    control().click()
    await settled()

    expect(client.emptyTrash).toHaveBeenCalledTimes(1)
  })

  it('says how many actually went, which the server is the judge of', async () => {
    await start()
    client.emptyTrash.mockResolvedValue(2)
    control().click()

    control().click()
    await settled()

    expect(statusText()).toContain('Deleted 2 entries for good')
  })

  it('says it in the singular when one entry went', async () => {
    await start([TRASHED])
    client.emptyTrash.mockResolvedValue(1)
    control().click()

    control().click()
    await settled()

    expect(statusText()).toContain('Deleted 1 entry for good')
  })

  it('redraws from the server, so the trash reflects what is really left', async () => {
    await start()
    control().click()
    client.trash.mockResolvedValue([])

    control().click()
    await settled()

    expect(rowFor(TRASH_PATH).textContent).toContain('Trash (0)')
  })

  it('reports a refusal rather than looking as though the trash emptied', async () => {
    await start()
    client.emptyTrash.mockRejectedValue(new Error('Busy'))
    control().click()

    control().click()
    await settled()

    expect(statusText()).toContain('Busy')
  })

  it('disarms when the browser redraws, so a stale confirmation cannot fire', async () => {
    await start()
    control().click()
    given(() => {
      expect(control().textContent).toBe('Delete 2 entries for good')
    })

    announceStoreChanged(host)
    await settled()

    expect(control().textContent).toBe('delete_sweep')
  })
})
