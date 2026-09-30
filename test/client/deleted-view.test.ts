'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDeletedView, type DeletedView } from '../../src/client/layout/deleted-view.ts'
import type { FilesClient } from '../../src/client/files/files-client.ts'
import type { TrashNode, TreeNode } from '../../src/client/files/tree-model.ts'
import type { Toast } from '../../src/client/layout/toast.ts'

import { cast } from '../cast.ts'

const DELETED_AT = '2026-09-01T10:00:00.000Z'
const ENTRY_ID = '0d5caef1-147f-45bf-8546-270886fcaa8f'

interface Fake {
  trash: ReturnType<typeof vi.fn>
  tree: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
}

let client: Fake = fakeClient()
let opened: string[] = []
let revealed: string[] = []
let errors: string[] = []
let loaded: PromiseWithResolvers<void> = Promise.withResolvers()
let restored: PromiseWithResolvers<void> = Promise.withResolvers()
let reported: PromiseWithResolvers<void> = Promise.withResolvers()

function fakeClient(): Fake {
  return {
    trash: vi.fn().mockResolvedValue([]),
    tree: vi.fn().mockResolvedValue([]),
    restore: vi.fn().mockResolvedValue(undefined),
  }
}

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = `
    <section id="view-deleted">
      <p id="deleted-what"></p>
      <p id="deleted-actions"><button type="button" id="deleted-restore">Restore</button></p>
      <p id="deleted-blocked" hidden></p>
    </section>`
  document.body.append(container)

  return container
}

function view(root: ParentNode): DeletedView {
  const toast = cast<Toast>({
    show: () => undefined,
    error: (message: string) => {
      errors.push(message)
      reported.resolve()
    },
  })

  return createDeletedView({
    root,
    client: cast<FilesClient>(client),
    toast,
    reveal: (at: string) => {
      revealed.push(at)
      loaded.resolve()
    },
    openUrl: (url: string) => {
      opened.push(url)
      restored.resolve()
    },
  })
}

function trashed(originalPath: string, kind: TrashNode['kind'], id = ENTRY_ID): TrashNode {
  return { id, originalPath, kind, deletedAt: DELETED_AT }
}

function fileNode(entryPath: string): TreeNode {
  return { name: entryPath, path: entryPath, kind: 'document' }
}

function textOf(root: ParentNode, selector: string): string {
  return root.querySelector(selector)?.textContent ?? ''
}

async function afterLoad(): Promise<void> {
  await loaded.promise
}

async function afterRestore(): Promise<void> {
  await restored.promise
}

async function afterReport(): Promise<void> {
  await reported.promise
}

beforeEach(() => {
  document.body.innerHTML = ''
  client = fakeClient()
  opened = []
  revealed = []
  errors = []
  loaded = Promise.withResolvers()
  restored = Promise.withResolvers()
  reported = Promise.withResolvers()
})

describe('an entry that is in the trash', () => {
  it('says what it was and when it went', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterLoad()

    expect(textOf(root, '#deleted-what')).toContain('The file journal/a.md was deleted')
  })

  it('calls a trashed folder a folder, because restoring one brings back everything in it', async () => {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterLoad()

    expect(textOf(root, '#deleted-what')).toContain('The folder journal')
  })

  it('titles the workspace by the path it came from, not by the entry id', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])

    view(page()).offer(ENTRY_ID)

    await afterLoad()

    expect(revealed).toStrictEqual(['journal/a.md'])
  })

  it('offers to restore it', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterLoad()

    expect(root.querySelector<HTMLElement>('#deleted-actions')?.hidden).toBe(false)
  })

  it('restores the entry the url named', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('#deleted-restore')?.click()

    await afterRestore()

    expect(client.restore).toHaveBeenCalledWith(ENTRY_ID)
  })

  it('opens the document at the path it came back to', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('#deleted-restore')?.click()

    await afterRestore()

    expect(opened).toStrictEqual(['/doc/journal/a.md'])
  })

  it('reports a refused restore rather than looking as though nothing happened', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    client.restore.mockRejectedValue(new Error('Already exists'))
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('#deleted-restore')?.click()

    await afterReport()

    expect(errors).toStrictEqual(['Restore failed: Already exists'])
  })
})

describe('an entry whose old path is in use again', () => {
  it('does not offer a restore that the server would refuse', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    client.tree.mockResolvedValue([fileNode('journal/a.md')])
    const root = page()

    view(root).offer(ENTRY_ID)
    await afterLoad()

    expect(root.querySelector<HTMLElement>('#deleted-actions')?.hidden).toBe(true)
  })

  it('says which path is in the way', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    client.tree.mockResolvedValue([fileNode('journal/a.md')])
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterLoad()

    expect(textOf(root, '#deleted-blocked')).toContain('journal/a.md is in use again')
  })
})

describe('an entry that is no longer in the trash', () => {
  it('says so rather than showing an empty view', async () => {
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterLoad()

    expect(textOf(root, '#deleted-what')).toContain('already have been restored or purged')
  })

  it('offers nothing to restore', async () => {
    const root = page()

    view(root).offer(ENTRY_ID)
    await afterLoad()

    expect(root.querySelector<HTMLElement>('#deleted-actions')?.hidden).toBe(true)
  })

  it('does nothing when the restore button is pressed anyway', async () => {
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('#deleted-restore')?.click()

    expect(client.restore).not.toHaveBeenCalled()
  })
})

describe('a second entry opened after the first', () => {
  it('clears what the previous one said', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    const deleted = view(root)
    deleted.offer(ENTRY_ID)
    await afterLoad()

    const stillLoading: PromiseWithResolvers<TrashNode[]> = Promise.withResolvers()
    client.trash.mockReturnValue(stillLoading.promise)
    deleted.offer('another-id')

    expect(textOf(root, '#deleted-what')).toBe('')
  })
})

describe('a trash listing that cannot be read', () => {
  it('reports it rather than pretending the entry is gone', async () => {
    client.trash.mockRejectedValue(new Error('network down'))
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterReport()

    expect(errors).toStrictEqual(['Could not read the trash: network down'])
  })
})

describe('markup that does not match', () => {
  it('declines rather than throwing, the way the dialog does', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    expect(() => {
      view(bare).offer(ENTRY_ID)
    }).not.toThrow()
  })
})
