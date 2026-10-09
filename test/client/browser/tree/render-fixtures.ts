'use sanity'

import { parseTree } from '../../../../src/client/browser/tree/tree-model.ts'
import { renderTree, type TreeViewModel } from '../../../../src/client/browser/tree/tree-view.ts'
import { ROW_SELECTOR } from '../../../../src/client/browser/tree/drawing.ts'

export const SAMPLE = parseTree({
  tree: [
    {
      name: 'journal',
      path: 'journal',
      kind: 'folder',
      children: [
        { name: '2026', path: 'journal/2026', kind: 'folder', children: [] },
        { name: 'entry.md', path: 'journal/entry.md', kind: 'document' },
      ],
    },
    { name: 'notes.md', path: 'notes.md', kind: 'document' },
    { name: 'photo.png', path: 'photo.png', kind: 'image' },
  ],
})

let mounted: HTMLElement = document.createElement('ul')

export function mountTree(): void {
  document.body.innerHTML = '<ul id="file-tree" role="tree"></ul>'
  const element = document.body.querySelector<HTMLElement>('#file-tree')
  if (element === null) throw new Error('missing tree')
  mounted = element
}

export function treeElement(): HTMLElement {
  return mounted
}

export function render(overrides: Partial<TreeViewModel> = {}): void {
  renderTree(mounted, { nodes: SAMPLE, open: new Set(), selected: null, ...overrides })
}

export function rows(): HTMLElement[] {
  return [...mounted.querySelectorAll<HTMLElement>(ROW_SELECTOR)]
}

export function pathsShown(): Array<string | undefined> {
  return rows().map((element) => element.dataset.path)
}

export function rowFor(entryPath: string): HTMLElement {
  const found = rows().find((element) => element.dataset.path === entryPath)
  if (found === undefined) throw new Error(`no row for ${entryPath}`)

  return found
}
