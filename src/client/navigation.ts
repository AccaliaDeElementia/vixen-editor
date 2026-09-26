'use sanity'

import { documentIdFromPath } from './doc-path.ts'
import { DOC_PREFIX, TRASH_PREFIX } from '../shared/page-urls.ts'

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

function isAppPath(pathname: string): boolean {
  return pathname.startsWith(DOC_PREFIX) || pathname.startsWith(TRASH_PREFIX)
}

export interface Navigator {
  back: () => void
  forward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
}

interface InterceptOptions {
  navigation?: Navigation | undefined
  open: (pathname: string) => Promise<void>
  onSettled?: (() => void) | undefined
}

const NOWHERE_TO_GO: Navigator = {
  back: () => undefined,
  forward: () => undefined,
  canGoBack: () => false,
  canGoForward: () => false,
}

function shouldHandle(event: NavigateEvent): boolean {
  if (!event.canIntercept || event.hashChange || event.downloadRequest !== null) return false
  if (event.formData !== null) return false

  return isAppPath(new URL(event.destination.url).pathname)
}

export function interceptNavigation(options: InterceptOptions): Navigator {
  const { navigation } = options
  if (navigation === undefined) return NOWHERE_TO_GO

  navigation.addEventListener('navigate', (event) => {
    if (!shouldHandle(event)) return

    const { pathname } = new URL(event.destination.url)
    event.intercept({
      handler: async () => {
        await options.open(pathname)
      },
    })
  })

  navigation.addEventListener('navigatesuccess', () => {
    if (options.onSettled !== undefined) options.onSettled()
  })

  return {
    back: () => {
      if (navigation.canGoBack) navigation.back()
    },
    forward: () => {
      if (navigation.canGoForward) navigation.forward()
    },
    canGoBack: () => navigation.canGoBack,
    canGoForward: () => navigation.canGoForward,
  }
}
