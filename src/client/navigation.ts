'use sanity'

import { documentIdFromPath } from './doc-path.ts'

export interface OpenDocument {
  path: () => string
  commit: (entryPath: string) => void
}

function createOwner(initial: string): OpenDocument {
  let open = initial

  return {
    path: () => open,
    commit: (entryPath: string) => {
      open = entryPath
    },
  }
}

const owners = new WeakMap<ParentNode, OpenDocument>()

export function openDocumentIn(root: ParentNode, pathname: string = window.location.pathname): OpenDocument {
  const existing = owners.get(root)
  if (existing !== undefined) return existing

  const created = createOwner(documentIdFromPath(pathname))
  owners.set(root, created)

  return created
}
