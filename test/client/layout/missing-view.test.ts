'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createMissingView, type MissingView } from '../../../src/client/layout/missing-view.ts'
import type { FilesClient } from '../../../src/client/files/files-client.ts'
import type { TrashNode, TreeNode } from '../../../src/client/files/tree-model.ts'
import type { Toast } from '../../../src/client/layout/toast.ts'

import { cast } from '../../cast.ts'

import { renderSection } from '../templates.ts'

const DELETED_AT = '2026-09-01T10:00:00.000Z'

interface Fake {
  trash: ReturnType<typeof vi.fn>
  tree: ReturnType<typeof vi.fn>
  createDocument: ReturnType<typeof vi.fn>
  upload: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
}

let client: Fake = fakeClient()
let reopen = vi.fn<() => void>()
let errors: string[] = []
let reopened: PromiseWithResolvers<void> = Promise.withResolvers()
let reported: PromiseWithResolvers<void> = Promise.withResolvers()

function fakeClient(): Fake {
  return {
    trash: vi.fn().mockResolvedValue([]),
    tree: vi.fn().mockResolvedValue([]),
    createDocument: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue('stored.md'),
    restore: vi.fn().mockResolvedValue(undefined),
  }
}

function page(): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = renderSection('#view-missing')
  document.body.append(container)

  return container
}

function view(root: ParentNode): MissingView {
  const toast = cast<Toast>({
    show: () => undefined,
    error: (message: string) => {
      errors.push(message)
      reported.resolve()
    },
  })

  return createMissingView({ root, client: cast<FilesClient>(client), toast, reopen })
}

function trashed(originalPath: string, kind: TrashNode['kind'], id = originalPath): TrashNode {
  return { id, originalPath, kind, deletedAt: DELETED_AT }
}

function folder(name: string): TreeNode {
  return { name, path: name, kind: 'folder', children: [] }
}

async function afterReopen(): Promise<void> {
  await reopened.promise
}

async function afterReport(): Promise<void> {
  await reported.promise
}

async function afterTheTrashIsRead(root: ParentNode): Promise<void> {
  const section = root.querySelector('#missing-restore')
  if (section === null) throw new Error('no restore section to watch')

  const read: PromiseWithResolvers<void> = Promise.withResolvers()
  const observer = new MutationObserver(() => {
    observer.disconnect()
    read.resolve()
  })
  observer.observe(section, { attributes: true })

  await read.promise
}

function dropFile(root: ParentNode, file: File): void {
  const input = root.querySelector<HTMLInputElement>('#missing-upload-input')
  Object.defineProperty(input, 'files', { value: [file], configurable: true })
  input?.dispatchEvent(new Event('change'))
}

beforeEach(() => {
  document.body.innerHTML = ''
  client = fakeClient()
  errors = []
  reopened = Promise.withResolvers()
  reported = Promise.withResolvers()
  reopen = vi.fn<() => void>(() => {
    reopened.resolve()
  })
})

describe('what the view offers for the kind of path', () => {
  it('offers to create a missing document, for a link written ahead of the prose', () => {
    const root = page()

    view(root).offer('journal/a.md')

    expect(root.querySelector<HTMLElement>('#missing-create')?.hidden).toBe(false)
  })

  it('does not offer to create a missing image, because there is no empty image worth making', () => {
    const root = page()

    view(root).offer('journal/photo.png')

    expect(root.querySelector<HTMLElement>('#missing-create')?.hidden).toBe(true)
  })

  it('restricts the picker to document extensions for a document path', () => {
    const root = page()

    view(root).offer('journal/a.md')

    expect(root.querySelector<HTMLInputElement>('#missing-upload-input')?.accept).toBe('.md,.txt')
  })

  it('restricts the picker to image extensions for an image path', () => {
    const root = page()

    view(root).offer('journal/photo.png')

    expect(root.querySelector<HTMLInputElement>('#missing-upload-input')?.accept).toBe(
      '.png,.jpg,.jpeg,.gif,.webp,.svg',
    )
  })
})

describe('creating the missing document', () => {
  it('creates it at the path that was asked for', async () => {
    const root = page()
    view(root).offer('journal/a.md')

    root.querySelector<HTMLButtonElement>('#missing-create')?.click()
    await afterReopen()

    expect(client.createDocument).toHaveBeenCalledWith('journal/a.md')
  })

  it('opens the document it just made', async () => {
    const root = page()
    view(root).offer('journal/a.md')

    root.querySelector<HTMLButtonElement>('#missing-create')?.click()
    await afterReopen()

    expect(reopen).toHaveBeenCalledTimes(1)
  })

  it('reports a refusal rather than looking as though nothing happened', async () => {
    client.createDocument.mockRejectedValue(new Error('already exists'))
    const root = page()
    view(root).offer('journal/a.md')

    root.querySelector<HTMLButtonElement>('#missing-create')?.click()
    await afterReport()

    expect(errors).toStrictEqual(['Create failed: already exists'])
  })
})

describe('uploading the missing file', () => {
  it('stores it under the name the path asked for, not the name the file carried', async () => {
    const root = page()
    view(root).offer('journal/photo.png')

    dropFile(root, new File(['x'], 'IMG_0042.png'))
    await afterReopen()

    expect(client.upload).toHaveBeenCalledWith('journal', expect.any(File), 'photo.png')
  })

  it('targets the store root for a path with no folder', async () => {
    const root = page()
    view(root).offer('photo.png')

    dropFile(root, new File(['x'], 'IMG_0042.png'))
    await afterReopen()

    expect(client.upload).toHaveBeenCalledWith('', expect.any(File), 'photo.png')
  })

  it('opens what it stored', async () => {
    const root = page()
    view(root).offer('journal/photo.png')

    dropFile(root, new File(['x'], 'photo.png'))
    await afterReopen()

    expect(reopen).toHaveBeenCalledTimes(1)
  })

  it('reports a rejected upload, which is the whole point of the detected format', async () => {
    client.upload.mockRejectedValue(new Error('Content does not match the file extension'))
    const root = page()
    view(root).offer('journal/photo.png')

    dropFile(root, new File(['x'], 'photo.png'))
    await afterReport()

    expect(errors).toStrictEqual(['Upload failed: Content does not match the file extension'])
  })
  it('opens the file picker when the upload button is pressed', () => {
    const root = page()
    const input = root.querySelector<HTMLInputElement>('#missing-upload-input')
    const clicked = vi.fn<() => void>()
    input?.addEventListener('click', clicked)
    view(root).offer('journal/photo.png')

    root.querySelector<HTMLButtonElement>('#missing-upload')?.click()

    expect(clicked).toHaveBeenCalledTimes(1)
  })

  it('does nothing when the picker is dismissed without a file', () => {
    const root = page()
    view(root).offer('journal/photo.png')

    root.querySelector<HTMLInputElement>('#missing-upload-input')?.dispatchEvent(new Event('change'))

    expect(client.upload).not.toHaveBeenCalled()
  })
})

describe('restoring from the trash', () => {
  it('says nothing about the trash when it holds no candidate', async () => {
    const root = page()

    view(root).offer('journal/a.md')
    await afterTheTrashIsRead(root)

    expect(root.querySelector<HTMLElement>('#missing-restore')?.hidden).toBe(true)
  })

  it('offers a direct match', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()

    view(root).offer('journal/a.md')

    await afterTheTrashIsRead(root)

    expect(root.querySelector<HTMLElement>('#missing-restore')?.hidden).toBe(false)
  })

  it('restores the entry the user picked', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document', 'entry-1')])
    const root = page()
    view(root).offer('journal/a.md')
    await afterTheTrashIsRead(root)

    root.querySelector<HTMLButtonElement>('#missing-restore-list button')?.click()
    await afterReopen()

    expect(client.restore).toHaveBeenCalledWith('entry-1')
  })

  it('says a folder candidate brings back the whole folder, so the blast radius is stated', async () => {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    const root = page()

    view(root).offer('journal/a.md')

    await afterTheTrashIsRead(root)

    expect(root.querySelector('#missing-restore-list')?.textContent).toContain('the whole folder journal')
  })

  it('offers no button for a candidate the live tree blocks', async () => {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    client.tree.mockResolvedValue([folder('journal')])
    const root = page()

    view(root).offer('journal/a.md')
    await afterTheTrashIsRead(root)

    expect(root.querySelector('#missing-restore-list button')).toBeNull()
  })

  it('says why a blocked candidate cannot be restored', async () => {
    client.trash.mockResolvedValue([trashed('journal', 'folder')])
    client.tree.mockResolvedValue([folder('journal')])
    const root = page()

    view(root).offer('journal/a.md')

    await afterTheTrashIsRead(root)

    expect(root.querySelector('#missing-restore-list')?.textContent).toContain('journal is back')
  })

  it('treats the server as authoritative when a restore is refused anyway', async () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document', 'entry-1')])
    client.restore.mockRejectedValue(new Error('Already exists'))
    const root = page()
    view(root).offer('journal/a.md')
    await afterTheTrashIsRead(root)

    root.querySelector<HTMLButtonElement>('#missing-restore-list button')?.click()
    await afterReport()

    expect(errors).toStrictEqual(['Restore failed: Already exists'])
  })

  it('clears a previous path’s candidates rather than stacking them', () => {
    client.trash.mockResolvedValue([trashed('journal/a.md', 'document')])
    const root = page()
    const missing = view(root)

    missing.offer('journal/a.md')
    missing.offer('journal/b.md')

    expect(root.querySelector<HTMLElement>('#missing-restore')?.hidden).toBe(true)
  })

  it('reports a trash listing it could not read, rather than pretending there is nothing', async () => {
    client.trash.mockRejectedValue(new Error('network down'))
    const root = page()

    view(root).offer('journal/a.md')

    await afterReport()

    expect(errors).toStrictEqual(['Could not read the trash: network down'])
  })
})

describe('a path whose extension names no kind', () => {
  it('accepts nothing, rather than offering a picker that cannot satisfy it', () => {
    const root = page()

    view(root).offer('archive.zip')

    expect(root.querySelector<HTMLInputElement>('#missing-upload-input')?.accept).toBe('')
  })
})

describe('a picker that yields nothing', () => {
  it('ignores a change event with no file list at all', () => {
    const root = page()
    view(root).offer('journal/photo.png')
    const input = root.querySelector<HTMLInputElement>('#missing-upload-input')
    Object.defineProperty(input, 'files', { value: null, configurable: true })

    input?.dispatchEvent(new Event('change'))

    expect(client.upload).not.toHaveBeenCalled()
  })
})

describe('markup that does not match', () => {
  it('declines when only the restore list is missing, not just when every part is', () => {
    const partial = document.createElement('div')
    partial.innerHTML = renderSection('#view-missing')
    partial.querySelector('#missing-restore-list')?.remove()
    document.body.append(partial)

    expect(() => {
      view(partial).offer('journal/a.md')
    }).not.toThrow()
  })

  it('declines rather than throwing, the way the dialog does', () => {
    const bare = document.createElement('div')
    document.body.append(bare)

    expect(() => {
      view(bare).offer('journal/a.md')
    }).not.toThrow()
  })
})
