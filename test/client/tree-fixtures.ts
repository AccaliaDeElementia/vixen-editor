'use sanity'

import { vi } from 'vitest'

import { ROW_SELECTOR } from '../../src/client/files/tree-view.ts'
import type { TrashNode } from '../../src/client/files/tree-model.ts'

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

const TOOLBAR = `
      <div id="toolbar">
        <button id="new-document"></button>
        <button id="new-folder"></button>
        <button id="upload-file"></button>
        <a id="download-archive" href="/api/files/archive"></a>
        <button id="delete-entry"></button>
        <button id="reveal-document"></button>
        <button id="insert-entry" disabled></button>
        <input id="upload-input" type="file">
      </div>`

const OPEN_SELECTED = '<button id="open-selected"></button>'

export function treePage({ withToolbar = false, withOpenSelected = false } = {}): HTMLElement {
  document.body.innerHTML = ''
  const host = document.createElement('div')
  host.innerHTML = `
    <aside id="explorer">${withToolbar ? TOOLBAR : ''}${withOpenSelected ? OPEN_SELECTED : ''}
      <ul id="file-tree" role="tree"></ul>
    </aside>
    <div id="status"></div>`
  document.body.append(host)

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
