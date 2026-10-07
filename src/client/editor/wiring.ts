'use sanity'

import { buildThePageWasServed } from '../build-watch.ts'
import { createDocumentClient } from './document-client.ts'
import { createFilesClient, type FilesClient } from '../files/files-client.ts'
import { createSession, type Session } from './session.ts'
import { MissingMountError } from './pane-workspace.ts'

const PANE_SELECTOR = '[data-part="pane"]'

interface PageWiring {
  root: ParentNode
  pathname: string
  search: string
  servedBuild: string | null
  session: Session
  navigate: (url: string) => void
  files: FilesClient
  reopen: () => void
  openUrl: (url: string) => void
  replaceUrl: (url: string) => void
}

interface WiringOverrides {
  root?: ParentNode
  pathname?: string
  search?: string
  servedBuild?: string | null
  session?: Session
  navigate?: (url: string) => void
  files?: FilesClient
  reopen?: () => void
  openUrl?: (url: string) => void
  replaceUrl?: (url: string) => void
}

export function paneIn(root: ParentNode): HTMLElement {
  const pane = root.querySelector<HTMLElement>(PANE_SELECTOR)
  if (pane === null) throw new MissingMountError(PANE_SELECTOR)

  return pane
}

function replaceAddress(url: string): void {
  window.history.replaceState(null, '', url)
}

function reloadPage(): void {
  window.location.reload()
}

function openPage(url: string): void {
  window.location.assign(url)
}

function replacePage(url: string): void {
  window.location.replace(url)
}

function pageAsServed(options: WiringOverrides): Pick<PageWiring, 'pathname' | 'search' | 'servedBuild'> {
  return {
    pathname: options.pathname ?? window.location.pathname,
    search: options.search ?? window.location.search,
    servedBuild: options.servedBuild ?? buildThePageWasServed(),
  }
}

export function wiringFor(options: WiringOverrides): PageWiring {
  return {
    ...pageAsServed(options),
    root: options.root ?? document,
    session: options.session ?? createSession(createDocumentClient()),
    navigate: options.navigate ?? replaceAddress,
    files: options.files ?? createFilesClient(),
    reopen: options.reopen ?? reloadPage,
    openUrl: options.openUrl ?? openPage,
    replaceUrl: options.replaceUrl ?? replacePage,
  }
}

export const TestOnly = { openPage, replacePage, reloadPage }
