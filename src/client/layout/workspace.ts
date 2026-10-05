'use sanity'

import { titleFor } from '../doc-path.ts'

export type WorkspaceView = 'pending' | 'document' | 'image' | 'missing' | 'deleted' | 'unreachable'

const VIEW_ELEMENTS: ReadonlyArray<readonly [WorkspaceView, string]> = [
  ['pending', '[data-part="view-pending"]'],
  ['document', '[data-part="editor"]'],
  ['image', '[data-part="view-image"]'],
  ['missing', '[data-part="view-missing"]'],
  ['deleted', '[data-part="view-deleted"]'],
  ['unreachable', '[data-part="view-unreachable"]'],
]

const DEFAULT_ACTION_SELECTOR = '[data-default-action]'
const MISSING_PATH_SELECTOR = '[data-part="missing-path"]'
const FOOTING_SELECTOR = '[data-part="footing"]'

export interface Workspace {
  show: (view: WorkspaceView, at: string) => void
  showing: () => WorkspaceView | null
}

function elementsOf(root: ParentNode): Map<WorkspaceView, HTMLElement> {
  const found = new Map<WorkspaceView, HTMLElement>()

  for (const [view, selector] of VIEW_ELEMENTS) {
    const element = root.querySelector<HTMLElement>(selector)
    if (element !== null) found.set(view, element)
  }

  return found
}

interface WorkspaceOptions {
  focusDocument: () => void
}

export function createWorkspace(host: ParentNode, options: WorkspaceOptions): Workspace {
  const elements = elementsOf(host)
  const footing = host.querySelector<HTMLElement>(FOOTING_SELECTOR)
  let current: WorkspaceView | null = null

  function reveal(view: WorkspaceView): HTMLElement | undefined {
    for (const [candidate, element] of elements) element.hidden = candidate !== view
    if (footing !== null) footing.hidden = view !== 'document'

    return elements.get(view)
  }

  function nameMissingPath(at: string): void {
    const missingPath = host.querySelector(MISSING_PATH_SELECTOR)
    if (missingPath !== null) missingPath.textContent = at
  }

  function retitle(at: string): void {
    const title = titleFor(at)
    if (title !== '') document.title = title
  }

  function takeFocus(view: WorkspaceView, element: HTMLElement | undefined): void {
    if (view === 'pending' || element === undefined) return
    if (view === 'document') {
      options.focusDocument()
      return
    }

    const action = element.querySelector<HTMLElement>(DEFAULT_ACTION_SELECTOR)
    ;(action ?? element).focus()
  }

  return {
    show(view: WorkspaceView, at: string): void {
      current = view
      const element = reveal(view)

      if (view === 'missing') nameMissingPath(at)

      retitle(at)
      takeFocus(view, element)
    },

    showing: () => current,
  }
}

export const TestOnly = { VIEW_ELEMENTS }
