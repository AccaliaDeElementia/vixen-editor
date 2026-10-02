'use sanity'

import { vi } from 'vitest'

import { ROW_SELECTOR } from '../../src/client/files/tree-view.ts'
import type { TrashNode } from '../../src/client/files/tree-model.ts'

import { renderPage } from './templates.ts'

export const TRASHED: TrashNode = {
  id: 'aaaa',
  originalPath: 'gone.md',
  kind: 'document',
  deletedAt: '2026-01-01T00:00:00.000Z',
}

export interface FakeClient {
  tree: ReturnType<typeof vi.fn>
  trash: ReturnType<typeof vi.fn>
  createDocument: ReturnType<typeof vi.fn>
  createFolder: ReturnType<typeof vi.fn>
  upload: ReturnType<typeof vi.fn>
  move: ReturnType<typeof vi.fn>
  remove: ReturnType<typeof vi.fn>
  restore: ReturnType<typeof vi.fn>
  purge: ReturnType<typeof vi.fn>
}

export function fakeClient(nodes: unknown, trash: readonly TrashNode[] = []): FakeClient {
  return {
    tree: vi.fn().mockResolvedValue(nodes),
    trash: vi.fn().mockResolvedValue([...trash]),
    createDocument: vi.fn().mockResolvedValue(undefined),
    createFolder: vi.fn().mockResolvedValue(undefined),
    upload: vi.fn().mockResolvedValue('uploaded.png'),
    move: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    restore: vi.fn().mockResolvedValue(undefined),
    purge: vi.fn().mockResolvedValue(undefined),
  }
}

const TOOLBAR_ACTIONS = [
  '#new-document',
  '#new-folder',
  '#upload-file',
  '#download-archive',
  '#delete-entry',
  '#reveal-document',
  '#insert-entry',
  '#upload-input',
]

export function treePage({ withToolbar = false, withOpenSelected = false } = {}): HTMLElement {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  host.innerHTML = renderPage()
  document.body.append(host)

  if (!withToolbar) for (const selector of TOOLBAR_ACTIONS) host.querySelector(selector)?.remove()
  if (!withOpenSelected) host.querySelector('#open-selected')?.remove()

  return host
}

export function rows(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
}

export function rowFor(entryPath: string): HTMLElement {
  const found = rows().find((element) => element.dataset.path === entryPath)
  if (found === undefined) throw new Error(`no row for ${entryPath}`)

  return found
}

export function statusText(): string {
  return [...document.querySelectorAll('#status .toast')].at(-1)?.textContent ?? ''
}
