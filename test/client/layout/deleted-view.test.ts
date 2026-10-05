'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDeletedView, type DeletedView } from '../../../src/client/layout/deleted-view.ts'
import type { Dialogs } from '../../../src/client/files/dialogs.ts'
import type { FilesClient } from '../../../src/client/files/files-client.ts'
import type { TrashNode, TreeNode } from '../../../src/client/files/tree-model.ts'
import type { Toast } from '../../../src/client/toast.ts'

import { cast } from '../../cast.ts'
import { givenAsync } from '../../conditions.ts'

import { onRevealRequested } from '../../../src/client/reveal-request.ts'
import { parseTrashEntry } from '../../../src/client/files/trash-entry.ts'
import { onStoreChanged } from '../../../src/client/store-changed.ts'

import { renderSection } from '../templates.ts'

const DELETED_AT = '2026-09-01T10:00:00.000Z'
const ENTRY_ID = '0d5caef1-147f-45bf-8546-270886fcaa8f'

interface Fake {
  trashEntry: ReturnType<typeof vi.fn>
  trash: ReturnType<typeof vi.fn>
  tree: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  purge: ReturnType<typeof vi.fn>
}

let client: Fake = fakeClient()
let confirms = true
let asked: PromiseWithResolvers<void> = Promise.withResolvers()
let opened: string[] = []
let revealed: string[] = []
let errors: string[] = []
let prompted: Array<Parameters<Dialogs['prompt']>[0]> = []
let refusals: Array<string | null> = []
let typed: string | null = null
let answered: PromiseWithResolvers<void> = Promise.withResolvers()
let loaded: PromiseWithResolvers<void> = Promise.withResolvers()
let restored: PromiseWithResolvers<void> = Promise.withResolvers()
let reported: PromiseWithResolvers<void> = Promise.withResolvers()

function fakeClient(): Fake {
  return {
    trash: vi.fn().mockResolvedValue([]),
    tree: vi.fn().mockResolvedValue([]),
    restore: vi.fn().mockResolvedValue({ restored: ['journal/a.md'], entryRemains: false }),
    trashEntry: vi.fn().mockResolvedValue(null),
    purge: vi.fn().mockResolvedValue(undefined),
  }
}

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderSection('[data-part="view-deleted"]')
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
    host: root,
    client: cast<FilesClient>(client),
    dialogs: cast<Dialogs>({
      confirm: () => {
        asked.resolve()

        return Promise.resolve(confirms)
      },
      prompt: async (request: Parameters<Dialogs['prompt']>[0]) => {
        prompted.push(request)
        const refusal = await request.submit(typed ?? request.value ?? '')
        refusals.push(refusal)
        answered.resolve()

        return refusal === null
      },
    }),
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

function reloading(): Promise<void> {
  loaded = Promise.withResolvers()

  return loaded.promise
}

async function afterRestore(): Promise<void> {
  await restored.promise
}

function settledPrompt(): Promise<void> {
  answered = Promise.withResolvers()

  return answered.promise
}

async function afterReport(): Promise<void> {
  await reported.promise
}

beforeEach(() => {
  document.body.innerHTML = ''
  client = fakeClient()
  confirms = true
  asked = Promise.withResolvers()
  opened = []
  revealed = []
  prompted = []
  refusals = []
  typed = null
  answered = Promise.withResolvers()
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

    expect(textOf(root, '[data-part="deleted-what"]')).toContain('The file journal/a.md was deleted')
  })

  it('calls a trashed folder a folder, because restoring one brings back everything in it', async () => {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterLoad()

    expect(textOf(root, '[data-part="deleted-what"]')).toContain('The folder journal')
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

    expect(root.querySelector<HTMLElement>('[data-part="deleted-actions"]')?.hidden).toBe(false)
  })

  it('restores the entry the url named', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()

    await afterRestore()

    expect(client.restore).toHaveBeenCalledWith(ENTRY_ID, [''])
  })

  it('opens the document at the path it came back to', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()

    await afterRestore()

    expect(opened).toStrictEqual(['/doc/journal/a.md'])
  })

  it('tells the rest of the app the store changed, so the file browser stops showing it deleted', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    const heard: string[] = []
    onStoreChanged(root, () => {
      heard.push('changed')
    })
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()

    await afterRestore()

    expect(heard).toStrictEqual(['changed'])
  })

  it('says nothing changed when the restore was refused', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    client.restore.mockRejectedValue(new Error('Already exists'))
    const root = page()
    const heard: string[] = []
    onStoreChanged(root, () => {
      heard.push('changed')
    })
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()

    await afterReport()

    expect(heard).toStrictEqual([])
  })

  it('reports a refused restore rather than looking as though nothing happened', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    client.restore.mockRejectedValue(new Error('Already exists'))
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()

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

    expect(root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.disabled).toBe(true)
  })

  it('still offers to be rid of it, which nothing in the way can prevent', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    client.tree.mockResolvedValue([fileNode('journal/a.md')])
    const root = page()

    view(root).offer(ENTRY_ID)
    await afterLoad()

    expect(root.querySelector<HTMLElement>('[data-part="deleted-actions"]')?.hidden).toBe(false)
  })

  it('says which path is in the way', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    client.tree.mockResolvedValue([fileNode('journal/a.md')])
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterLoad()

    expect(textOf(root, '[data-part="deleted-blocked"]')).toContain('journal/a.md is in use again')
  })
})

describe('an entry that is no longer in the trash', () => {
  it('says so rather than showing an empty view', async () => {
    const root = page()

    view(root).offer(ENTRY_ID)

    await afterLoad()

    expect(textOf(root, '[data-part="deleted-what"]')).toContain('already have been restored or purged')
  })

  it('offers nothing to restore', async () => {
    const root = page()

    view(root).offer(ENTRY_ID)
    await afterLoad()

    expect(root.querySelector<HTMLElement>('[data-part="deleted-actions"]')?.hidden).toBe(true)
  })

  it('does nothing when the restore button is pressed anyway', async () => {
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()

    expect(client.restore).not.toHaveBeenCalled()
  })

  it('does nothing when the delete button is pressed anyway', async () => {
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    root.querySelector<HTMLButtonElement>('[data-part="deleted-purge"]')?.click()

    expect(client.purge).not.toHaveBeenCalled()
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

    expect(textOf(root, '[data-part="deleted-what"]')).toBe('')
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

  it('declines when it has the actions but nowhere to list what was deleted', () => {
    const root = page()
    root.querySelector('[data-part="deleted-contents"]')?.remove()

    view(root).offer(ENTRY_ID)

    expect(client.trash).not.toHaveBeenCalled()
  })
})

describe('deleting an entry for good', () => {
  async function offering(): Promise<HTMLElement> {
    client.trash.mockResolvedValue([trashed('journal/gone.md', 'document')])
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    return root
  }

  function pressPurge(root: ParentNode): void {
    root.querySelector<HTMLButtonElement>('[data-part="deleted-purge"]')?.click()
  }

  function watchForChange(root: ParentNode): Promise<void> {
    const changed: PromiseWithResolvers<void> = Promise.withResolvers()
    onStoreChanged(root, () => {
      changed.resolve()
    })

    return changed.promise
  }

  it('asks before destroying anything', async () => {
    const root = await offering()
    confirms = false

    pressPurge(root)
    await asked.promise

    expect(client.purge).not.toHaveBeenCalled()
  })

  it('purges the entry once that is confirmed', async () => {
    const root = await offering()
    const changed = watchForChange(root)

    pressPurge(root)
    await changed

    expect(client.purge).toHaveBeenCalledWith(ENTRY_ID)
  })

  it('says so afterwards, rather than still offering it back', async () => {
    const root = await offering()
    const changed = watchForChange(root)

    pressPurge(root)
    await changed

    expect(textOf(root, '[data-part="deleted-what"]')).toBe('journal/gone.md was deleted for good.')
  })

  it('takes the actions away, since there is nothing left to restore', async () => {
    const root = await offering()
    const changed = watchForChange(root)

    pressPurge(root)
    await changed

    expect(root.querySelector<HTMLElement>('[data-part="deleted-actions"]')?.hidden).toBe(true)
  })

  it('reports a refused purge rather than looking as though nothing happened', async () => {
    const root = await offering()
    client.purge.mockRejectedValue(new Error('gone already'))

    pressPurge(root)
    await afterReport()

    expect(errors).toStrictEqual(['Delete failed: gone already'])
  })
})

describe('keeping the file browser in step', () => {
  function watchReveals(root: ParentNode): string[] {
    const shown: string[] = []
    onRevealRequested(root, (entryPath) => {
      shown.push(entryPath)
    })

    return shown
  }

  it('asks it to show the entry being looked at', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    const shown = watchReveals(root)

    view(root).offer(ENTRY_ID)
    await afterLoad()

    expect(shown).toStrictEqual([`.trash/${ENTRY_ID}`])
  })

  it('asks it to show the restored path, so the toolbar aims at it', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()
    const shown = watchReveals(root)

    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()
    await afterRestore()

    expect(shown).toStrictEqual(['journal/a.md'])
  })

  it('asks nothing when the restore was refused', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    client.restore.mockRejectedValue(new Error('Already exists'))
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()
    const shown = watchReveals(root)

    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()
    await afterReport()

    expect(shown).toStrictEqual([])
  })
})

function watchPurge(root: ParentNode): Promise<void> {
  const changed: PromiseWithResolvers<void> = Promise.withResolvers()
  onStoreChanged(root, () => {
    changed.resolve()
  })

  return changed.promise
}

describe('what the entry holds', () => {
  const HELD = {
    entry: {
      name: 'journal',
      path: '',
      kind: 'folder',
      restorable: true,
      blockedBy: null,
      children: [{ name: 'a.md', path: 'a.md', kind: 'document', restorable: true, blockedBy: null, children: [] }],
    },
  }

  async function showing(): Promise<HTMLElement> {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    client.trashEntry.mockResolvedValue(parseTrashEntry(HELD))
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    return root
  }

  it('is asked for by the entry being shown', async () => {
    await showing()

    expect(client.trashEntry).toHaveBeenCalledWith(ENTRY_ID)
  })

  it('is listed, so the reader can see what they would get back', async () => {
    const root = await showing()

    expect([...root.querySelectorAll('.restore-tree__row')].map((row) => row.getAttribute('aria-label'))).toStrictEqual(
      ['journal', 'a.md'],
    )
  })

  it('stays out of sight when the server could not describe it', async () => {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    client.trashEntry.mockResolvedValue(null)
    const root = page()

    view(root).offer(ENTRY_ID)
    await afterLoad()

    expect(root.querySelector<HTMLElement>('[data-part="deleted-contents"]')?.hidden).toBe(true)
  })

  it('is cleared away once the entry has been purged', async () => {
    const root = await showing()

    root.querySelector<HTMLButtonElement>('[data-part="deleted-purge"]')?.click()
    await givenAsync(watchPurge(root))

    expect(root.querySelector<HTMLElement>('[data-part="deleted-contents"]')?.hidden).toBe(true)
  })
})

describe('restoring part of what was deleted', () => {
  function folder(children: unknown[]): unknown {
    return {
      entry: { name: 'journal', path: '', kind: 'folder', restorable: true, blockedBy: null, children },
    }
  }

  function inside(name: string): unknown {
    return { name, path: name, kind: 'document', restorable: true, blockedBy: null, children: [] }
  }

  async function showing(children: unknown[]): Promise<HTMLElement> {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    client.trashEntry.mockResolvedValue(parseTrashEntry(folder(children)))
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    return root
  }

  function untick(root: ParentNode, path: string): void {
    root.querySelector<HTMLElement>(`.restore-tree__row[data-path="${path}"]`)?.click()
  }

  function clickRestore(root: ParentNode): void {
    root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.click()
  }

  it('asks for the whole entry while nothing has been unticked', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])

    clickRestore(root)
    await afterRestore()

    expect(client.restore).toHaveBeenCalledWith(ENTRY_ID, [''])
  })

  it('asks only for the parts still ticked', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])
    client.restore.mockResolvedValue({ restored: ['journal/a.md'], entryRemains: true })

    const shown = reloading()
    untick(root, 'b.md')

    clickRestore(root)
    await givenAsync(shown)

    expect(client.restore).toHaveBeenCalledWith(ENTRY_ID, ['a.md'])
  })

  it('offers no restore once nothing is left ticked', async () => {
    const root = await showing([inside('a.md')])

    untick(root, '')

    expect(root.querySelector<HTMLButtonElement>('[data-part="deleted-restore"]')?.disabled).toBe(true)
  })

  it('opens what came back when nothing is left in the entry', async () => {
    const root = await showing([inside('a.md')])
    client.restore.mockResolvedValue({ restored: ['journal/a.md'], entryRemains: false })

    clickRestore(root)
    await afterRestore()

    expect(opened).toStrictEqual(['/doc/journal/a.md'])
  })

  it('lands on the folder that holds everything that came back', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])
    client.restore.mockResolvedValue({ restored: ['journal/a.md', 'journal/b.md'], entryRemains: false })

    clickRestore(root)
    await afterRestore()

    expect(opened).toStrictEqual(['/doc/journal/'])
  })

  it('goes to the store root when what came back has no folder in common', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])
    client.restore.mockResolvedValue({ restored: ['journal/a.md', 'notes.md'], entryRemains: false })

    clickRestore(root)
    await afterRestore()

    expect(opened).toStrictEqual(['/doc/'])
  })

  it('goes to the store root when the server says nothing came back', async () => {
    const root = await showing([inside('a.md')])
    client.restore.mockResolvedValue({ restored: [], entryRemains: false })

    clickRestore(root)
    await afterRestore()

    expect(opened).toStrictEqual(['/doc/'])
  })

  it('shows what is still in the trash when the entry outlives the restore', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])
    client.restore.mockResolvedValue({ restored: ['journal/a.md'], entryRemains: true })
    client.trashEntry.mockResolvedValue(parseTrashEntry(folder([inside('b.md')])))
    const shown = reloading()

    clickRestore(root)
    await givenAsync(shown)

    expect([...root.querySelectorAll<HTMLElement>('.restore-tree__row')].map((row) => row.dataset.path)).toStrictEqual([
      '',
      'b.md',
    ])
  })

  it('stays put rather than opening a document when the entry outlives the restore', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])
    client.restore.mockResolvedValue({ restored: ['journal/a.md'], entryRemains: true })
    const shown = reloading()

    clickRestore(root)
    await givenAsync(shown)

    expect(opened).toStrictEqual([])
  })
})

describe('putting one part back somewhere else', () => {
  function folder(children: unknown[]): unknown {
    return {
      entry: { name: 'journal', path: '', kind: 'folder', restorable: true, blockedBy: null, children },
    }
  }

  function inside(name: string, extra: Record<string, unknown> = {}): unknown {
    return { name, path: name, kind: 'document', restorable: true, blockedBy: null, children: [], ...extra }
  }

  async function showing(children: unknown[]): Promise<HTMLElement> {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    client.trashEntry.mockResolvedValue(parseTrashEntry(folder(children)))
    const root = page()
    view(root).offer(ENTRY_ID)
    await afterLoad()

    return root
  }

  function renameIn(root: ParentNode, path: string): void {
    root.querySelector<HTMLButtonElement>(`[data-path="${path}"] .restore-tree__rename`)?.click()
  }

  it('starts the reader off at the path it would have gone back to', async () => {
    const root = await showing([inside('a.md')])

    const asked = settledPrompt()
    renameIn(root, 'a.md')
    await givenAsync(asked)

    expect(prompted.at(0)?.value).toBe('journal/a.md')
  })

  it('restores only that one, to the path the reader chose', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])
    typed = 'elsewhere/a.md'

    const asked = settledPrompt()
    renameIn(root, 'a.md')
    await givenAsync(asked)

    expect(client.restore).toHaveBeenCalledWith(ENTRY_ID, ['a.md'], 'elsewhere/a.md')
  })

  it('is the way back for a name the store no longer allows', async () => {
    const root = await showing([inside(' odd.md', { restorable: false })])
    typed = 'journal/odd.md'

    const asked = settledPrompt()
    renameIn(root, ' odd.md')
    await givenAsync(asked)

    expect(client.restore).toHaveBeenCalledWith(ENTRY_ID, [' odd.md'], 'journal/odd.md')
  })

  it('says why the server refused inside the dialog, where the reader still is', async () => {
    const root = await showing([inside('a.md')])
    client.restore.mockRejectedValue(new Error('Already exists'))

    const asked = settledPrompt()
    renameIn(root, 'a.md')
    await givenAsync(asked)

    expect(refusals).toStrictEqual(['Already exists'])
  })

  it('says nothing to the page when the dialog has already said it', async () => {
    const root = await showing([inside('a.md')])
    client.restore.mockRejectedValue(new Error('Already exists'))

    const asked = settledPrompt()
    renameIn(root, 'a.md')
    await givenAsync(asked)

    expect(errors).toStrictEqual([])
  })

  it('opens what came back when nothing is left in the entry', async () => {
    const root = await showing([inside('a.md')])
    client.restore.mockResolvedValue({ restored: ['elsewhere/a.md'], entryRemains: false })

    renameIn(root, 'a.md')
    await afterRestore()

    expect(opened).toStrictEqual(['/doc/elsewhere/a.md'])
  })

  it('shows what is still in the trash when the entry outlives it', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])
    client.restore.mockResolvedValue({ restored: ['elsewhere/a.md'], entryRemains: true })
    client.trashEntry.mockResolvedValue(parseTrashEntry(folder([inside('b.md')])))
    const shown = reloading()

    renameIn(root, 'a.md')
    await givenAsync(shown)

    expect([...root.querySelectorAll<HTMLElement>('.restore-tree__row')].map((row) => row.dataset.path)).toStrictEqual([
      '',
      'b.md',
    ])
  })

  it('leaves the ticked choice untouched, so reaching for it costs nothing', async () => {
    const root = await showing([inside('a.md'), inside('b.md')])
    client.restore.mockResolvedValue({ restored: ['elsewhere/a.md'], entryRemains: true })
    const shown = reloading()

    renameIn(root, 'a.md')
    await givenAsync(shown)

    expect(root.querySelector('[data-path=""]')?.getAttribute('aria-checked')).toBe('true')
  })

  it('offers the whole entry a new home too, which is the way back for a blocked one', async () => {
    const root = await showing([inside('a.md')])
    typed = 'journal-restored'

    const asked = settledPrompt()
    renameIn(root, '')
    await givenAsync(asked)

    expect(client.restore).toHaveBeenCalledWith(ENTRY_ID, [''], 'journal-restored')
  })
})
