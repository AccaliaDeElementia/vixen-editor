'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { announceStoreChanged } from '../../../../src/client/store-changed.ts'
import { parseTree } from '../../../../src/client/files/tree-model.ts'
import { ROW_SELECTOR } from '../../../../src/client/files/tree-view.ts'
import type { FilesClient } from '../../../../src/client/files/files-client.ts'
import { cast } from '../../../cast.ts'
import { given } from '../../../conditions.ts'
import { fakeClient, mountTree, rowFor, treePage } from '../../tree-fixtures.ts'

const BEFORE = parseTree({ tree: [{ name: 'notes.md', path: 'notes.md', kind: 'document' }] })
const AFTER = parseTree({
  tree: [
    { name: 'arrived.md', path: 'arrived.md', kind: 'document' },
    { name: 'notes.md', path: 'notes.md', kind: 'document' },
  ],
})

let host: HTMLElement = document.createElement('div')
let client = fakeClient(BEFORE)
let settled: () => Promise<void> = () => Promise.resolve()

async function start(): Promise<void> {
  client = fakeClient(BEFORE)
  settled = await mountTree({ root: host, pathname: '/doc/', client: cast<FilesClient>(client) })
}

function pathsShown(): Array<string | undefined> {
  return [...host.querySelectorAll<HTMLElement>(ROW_SELECTOR)].map((element) => element.dataset.path)
}

function drag(type: string): void {
  rowFor('notes.md').dispatchEvent(new Event(type, { bubbles: true }))
}

async function changedElsewhere(): Promise<void> {
  client.tree.mockResolvedValue(AFTER)
  announceStoreChanged(host)
  await settled()
}

beforeEach(() => {
  localStorage.clear()
  host = treePage()
})

describe('a change arriving while a row is being dragged', () => {
  it('leaves the tree alone from the moment a row is pressed, before any drag begins', async () => {
    await start()
    drag('pointerdown')

    await changedElsewhere()

    expect(pathsShown()).not.toContain('arrived.md')
  })

  it('redraws once the press is released without a drag', async () => {
    await start()
    drag('pointerdown')
    await changedElsewhere()

    drag('pointerup')

    expect(pathsShown()).toContain('arrived.md')
  })

  it('leaves the tree where the reader grabbed it', async () => {
    await start()
    drag('dragstart')

    await changedElsewhere()

    expect(pathsShown()).not.toContain('arrived.md')
  })

  it('arrives once the drag is over, so nothing is lost', async () => {
    await start()
    drag('dragstart')
    await changedElsewhere()
    given(() => {
      expect(pathsShown()).not.toContain('arrived.md')
    })

    drag('dragend')

    expect(pathsShown()).toContain('arrived.md')
  })

  it('redraws at once when no drag is in flight', async () => {
    await start()

    await changedElsewhere()

    expect(pathsShown()).toContain('arrived.md')
  })
})

describe('a press that does not end on the tree', () => {
  function pressTheTree(): void {
    host.querySelector('#file-tree')?.dispatchEvent(new Event('pointerdown', { bubbles: true }))
  }

  it('releases when the pointer comes up somewhere else entirely', async () => {
    await start()
    pressTheTree()
    await changedElsewhere()

    document.dispatchEvent(new Event('pointerup', { bubbles: true }))

    expect(pathsShown()).toContain('arrived.md')
  })

  it('releases when the gesture is cancelled, which is what touch does', async () => {
    await start()
    pressTheTree()
    await changedElsewhere()

    document.dispatchEvent(new Event('pointercancel', { bubbles: true }))

    expect(pathsShown()).toContain('arrived.md')
  })
})
