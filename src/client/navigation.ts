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

function addressOf(url: string): string {
  const { pathname, search } = new URL(url, window.location.href)

  return `${pathname}${search}`
}

function isAppPath(pathname: string): boolean {
  return pathname.startsWith(DOC_PREFIX) || pathname.startsWith(TRASH_PREFIX)
}

export interface Navigator {
  replaceQuietly: (url: string) => void
  back: () => void
  forward: () => void
  canGoBack: () => boolean
  canGoForward: () => boolean
  stopIntercepting: () => void
}

interface InterceptOptions {
  navigation?: Navigation | undefined
  open: (pathname: string, search: string) => Promise<void>
  mayLeave?: (() => boolean) | undefined
  settle?: (() => Promise<boolean>) | undefined
  onSettled?: (() => void) | undefined
}

const NOWHERE_TO_GO: Navigator = {
  replaceQuietly: (url: string) => {
    window.history.replaceState(null, '', url)
  },
  back: () => undefined,
  forward: () => undefined,
  canGoBack: () => false,
  canGoForward: () => false,
  stopIntercepting: () => undefined,
}

function shouldHandle(event: NavigateEvent): boolean {
  if (!event.canIntercept || event.hashChange || event.downloadRequest !== null) return false
  if (event.formData !== null || event.navigationType === 'reload') return false

  return isAppPath(new URL(event.destination.url).pathname)
}

function blocks(options: InterceptOptions, event: NavigateEvent): boolean {
  if (options.mayLeave === undefined || options.settle === undefined) return false

  return !options.mayLeave() && event.cancelable
}

function ignoreOutcome(result: NavigationResult): void {
  void result.committed?.catch(() => undefined)
}

function resume(navigation: Navigation, event: NavigateEvent): void {
  const { navigationType: how } = event

  if (how === 'traverse') {
    ignoreOutcome(navigation.traverseTo(event.destination.key))

    return
  }

  const history: NavigationHistoryBehavior = how === 'replace' ? 'replace' : 'push'
  ignoreOutcome(navigation.navigate(event.destination.url, { history }))
}

export function interceptNavigation(options: InterceptOptions): Navigator {
  const { navigation } = options
  if (navigation === undefined) return NOWHERE_TO_GO

  let ownUpdate: string | null = null

  const onNavigate = (event: NavigateEvent): void => {
    if (ownUpdate === addressOf(event.destination.url)) {
      ownUpdate = null

      return
    }
    if (!shouldHandle(event)) return

    if (blocks(options, event)) {
      event.preventDefault()
      void options.settle?.().then((proceed) => {
        if (proceed) resume(navigation, event)
      })

      return
    }

    const { pathname, search } = new URL(event.destination.url)
    event.intercept({
      handler: async () => {
        await options.open(pathname, search)
      },
    })
  }

  const onNavigateSuccess = (): void => {
    if (options.onSettled !== undefined) options.onSettled()
  }

  navigation.addEventListener('navigate', onNavigate)
  navigation.addEventListener('navigatesuccess', onNavigateSuccess)

  return {
    replaceQuietly: (url: string) => {
      ownUpdate = addressOf(url)
      window.history.replaceState(null, '', url)
    },
    stopIntercepting: () => {
      navigation.removeEventListener('navigate', onNavigate)
      navigation.removeEventListener('navigatesuccess', onNavigateSuccess)
    },
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
