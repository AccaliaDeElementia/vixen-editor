'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { announceStoreChanged } from '../../../../src/client/store-changed.ts'
import { onTrashEmptied } from '../../../../src/client/trash-emptied.ts'
import { parseTree } from '../../../../src/client/files/tree-model.ts'
import type { FilesClient } from '../../../../src/client/files/files-client.ts'
import type { Dialogs } from '../../../../src/client/files/dialogs.ts'
import { cast } from '../../../cast.ts'
import { TRASHED, fakeClient, mountTree, showTrash, statusText, trashRows, treePage } from '../../tree-fixtures.ts'

const SAMPLE = parseTree({ tree: [{ name: 'notes.md', path: 'notes.md', kind: 'document' }] })

let host: HTMLElement = document.createElement('div')
let client = fakeClient(SAMPLE, [TRASHED])
let settled: () => Promise<void> = () => Promise.resolve()

async function start(trash = [TRASHED, { ...TRASHED, id: 'bbbb' }]): Promise<void> {
  client = fakeClient(SAMPLE, trash)
  dialogs.confirm.mockResolvedValue(true)
  settled = await mountTree({
    root: host,
    pathname: '/doc/',
    client: cast<FilesClient>(client),
    dialogs: cast<Dialogs>(dialogs),
  })
  showTrash(host)
  await settled()
}

function control(): HTMLButtonElement {
  const button = host.querySelector<HTMLButtonElement>('#empty-trash')
  if (button === null) throw new Error('the trash offers no way to empty it')

  return button
}

beforeEach(() => {
  localStorage.clear()
  host = treePage()
})

const dialogs: { confirm: ReturnType<typeof vi.fn> } = { confirm: vi.fn().mockResolvedValue(true) }

describe('asking to empty the trash', () => {
  it('asks first, the same way deleting a file from the browser does', async () => {
    await start()

    control().click()

    expect(client.emptyTrash).not.toHaveBeenCalled()
  })

  it('says what it would cost, where there is room to read it', async () => {
    await start()

    control().click()

    expect(dialogs.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ message: '2 entries will be deleted for good, and cannot be restored afterwards.' }),
    )
  })

  it('empties it once the reader agrees', async () => {
    await start()

    control().click()
    await settled()

    expect(client.emptyTrash).toHaveBeenCalledTimes(1)
  })

  it('leaves it alone when the reader does not', async () => {
    await start()
    dialogs.confirm.mockResolvedValue(false)

    control().click()
    await settled()

    expect(client.emptyTrash).not.toHaveBeenCalled()
  })

  it('says how many actually went, which the server is the judge of', async () => {
    await start()
    client.emptyTrash.mockResolvedValue(2)

    control().click()
    await settled()

    expect(statusText()).toContain('Deleted 2 entries for good')
  })

  it('says it in the singular when one entry went', async () => {
    await start([TRASHED])
    client.emptyTrash.mockResolvedValue(1)

    control().click()
    await settled()

    expect(statusText()).toContain('Deleted 1 entry for good')
  })

  it('redraws from the server, so the trash reflects what is really left', async () => {
    await start()
    client.trash.mockResolvedValue([])

    control().click()
    await settled()

    expect(trashRows()).toStrictEqual([])
  })

  it('reports a refusal rather than looking as though the trash emptied', async () => {
    await start()
    client.emptyTrash.mockRejectedValue(new Error('Busy'))

    control().click()
    await settled()

    expect(statusText()).toContain('Busy')
  })
})

describe('a trash panel with nothing in it', () => {
  function placeholder(): HTMLElement | null {
    return host.querySelector<HTMLElement>('[data-part="trash-empty"]')
  }

  it('says so, rather than showing an empty pane that reads as broken', async () => {
    await start([])

    expect(placeholder()?.hidden).toBe(false)
  })

  it('says what the panel is for, since a reader is seeing it before using it', async () => {
    await start([])

    expect(placeholder()?.textContent).toContain('until you empty the trash')
  })

  it('gets out of the way once something has been deleted', async () => {
    await start([TRASHED])

    expect(placeholder()?.hidden).toBe(true)
  })

  it('comes back when the last entry goes', async () => {
    await start([TRASHED])
    client.trash.mockResolvedValue([])
    announceStoreChanged(host)
    await settled()

    expect(placeholder()?.hidden).toBe(false)
  })

  it('offers nothing to empty, since there is nothing to empty', async () => {
    await start([])

    expect(host.querySelector<HTMLElement>('#empty-trash')?.hidden).toBe(true)
  })
})

describe('what emptying the trash tells the rest of the app', () => {
  it('announces it, so a pane showing a deleted entry can let go of it', async () => {
    await start()
    let heard = 0
    onTrashEmptied(host, () => {
      heard += 1
    })

    control().click()
    await settled()

    expect(heard).toBe(1)
  })

  it('says nothing when the reader declines, since nothing went', async () => {
    await start()
    let heard = 0
    onTrashEmptied(host, () => {
      heard += 1
    })
    dialogs.confirm.mockResolvedValue(false)

    control().click()
    await settled()

    expect(heard).toBe(0)
  })
})
