'use sanity'

import { beforeEach, describe, expect, it } from 'vitest'

import { paneIn, TestOnly, wiringFor } from '../../../src/client/app/wiring.ts'
import { MissingMountError } from '../../../src/client/workspace/panes/pane-workspace.ts'
import type { FilesClient } from '../../../src/client/browser/files-client.ts'
import type { Session } from '../../../src/client/document/session.ts'

import { cast } from '../../cast.ts'
import { given } from '../../conditions.ts'

const { openPage, reloadPage, replaceAddress, replacePage } = TestOnly

const A_PATH = '/doc/journal/notes.md'
const A_SEARCH = '?view=markup'
const A_BUILD = 'built-today'

function page(markup: string): HTMLElement {
  document.body.innerHTML = markup

  return document.body
}

beforeEach(() => {
  document.body.innerHTML = ''
  document.head.innerHTML = ''
  window.history.replaceState(null, '', '/')
})

describe('finding the pane to mount into', () => {
  it('is the one the page marked', () => {
    const root = page('<section data-part="pane" id="first"></section>')

    expect(paneIn(root).id).toBe('first')
  })

  it('is the first of them, since the second pane arrives later', () => {
    const root = page('<section data-part="pane" id="first"></section><section data-part="pane" id="second"></section>')

    expect(paneIn(root).id).toBe('first')
  })

  it('refuses a page with nowhere to mount, rather than carrying on without an editor', () => {
    expect(() => paneIn(page('<main></main>'))).toThrow(MissingMountError)
  })

  it('names the thing it could not find, so the failure says what the page is missing', () => {
    expect(() => paneIn(page('<main></main>'))).toThrow('[data-part="pane"]')
  })
})

describe('what the page was served as', () => {
  it('reads the path from the address bar', () => {
    window.history.replaceState(null, '', A_PATH)

    expect(wiringFor({}).pathname).toBe(A_PATH)
  })

  it('reads the query from the address bar, which is where the view is named', () => {
    window.history.replaceState(null, '', `${A_PATH}${A_SEARCH}`)

    expect(wiringFor({}).search).toBe(A_SEARCH)
  })

  it('reads the build the page was served with, so a stale tab can notice', () => {
    document.head.innerHTML = `<meta name="vixen-build" content="${A_BUILD}">`

    expect(wiringFor({}).servedBuild).toBe(A_BUILD)
  })

  it('has no build when the page carries none, which is how a dev server serves it', () => {
    expect(wiringFor({}).servedBuild).toBeNull()
  })
})

describe('what the application is wired to by default', () => {
  it('mounts into the whole document', () => {
    expect(wiringFor({}).root).toBe(document)
  })

  it('builds a session of its own', () => {
    expect(wiringFor({}).session).toBeDefined()
  })

  it('builds a files client of its own', () => {
    expect(wiringFor({}).files).toBeDefined()
  })

  it('navigates by rewriting the address alone, rather than leaving the page for it', () => {
    expect(wiringFor({}).navigate).toBe(replaceAddress)
  })

  it('rewrites the address when it navigates', () => {
    given(() => {
      expect(window.location.pathname).toBe('/')
    })

    wiringFor({}).navigate(A_PATH)

    expect(window.location.pathname).toBe(A_PATH)
  })

  it('reopens by reloading the page', () => {
    expect(wiringFor({}).reopen).toBe(reloadPage)
  })

  it('opens a url by leaving for it', () => {
    expect(wiringFor({}).openUrl).toBe(openPage)
  })

  it('replaces a url without leaving a history entry behind', () => {
    expect(wiringFor({}).replaceUrl).toBe(replacePage)
  })
})

describe('what a caller hands in instead', () => {
  it('mounts into the root it was given', () => {
    const root = page('<main></main>')

    expect(wiringFor({ root }).root).toBe(root)
  })

  it('takes the path it was given over the address bar', () => {
    window.history.replaceState(null, '', '/doc/somewhere-else.md')

    expect(wiringFor({ pathname: A_PATH }).pathname).toBe(A_PATH)
  })

  it('takes the query it was given', () => {
    expect(wiringFor({ search: A_SEARCH }).search).toBe(A_SEARCH)
  })

  it('takes the build it was given over the page', () => {
    document.head.innerHTML = '<meta name="vixen-build" content="served-long-ago">'

    expect(wiringFor({ servedBuild: A_BUILD }).servedBuild).toBe(A_BUILD)
  })

  it('takes the session it was given, which is how a test drives a fake store', () => {
    const session = cast<Session>({})

    expect(wiringFor({ session }).session).toBe(session)
  })

  it('takes the files client it was given', () => {
    const files = cast<FilesClient>({})

    expect(wiringFor({ files }).files).toBe(files)
  })

  it.each([
    ['navigate', 'navigate'],
    ['reopen', 'reopen'],
    ['openUrl', 'openUrl'],
    ['replaceUrl', 'replaceUrl'],
  ] as const)('takes the %s it was given', (_label, key) => {
    const handed = (): void => undefined

    expect(wiringFor({ [key]: handed })[key]).toBe(handed)
  })
})
