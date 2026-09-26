'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { interceptNavigation } from '../../src/client/navigation.ts'

import { cast } from '../cast.ts'

interface FakeNavigation {
  addEventListener: (type: string, handler: (event: unknown) => void) => void
  fire: (event: unknown) => void
  settle: () => void
  back: ReturnType<typeof vi.fn>
  forward: ReturnType<typeof vi.fn>
  canGoBack: boolean
  canGoForward: boolean
}

interface Attempt {
  intercepted: boolean
  handled: string[]
}

let opened: string[] = []

function fakeNavigation(): FakeNavigation {
  const handlers = new Map<string, (event: unknown) => void>()

  return {
    addEventListener: (type: string, handler: (event: unknown) => void) => {
      handlers.set(type, handler)
    },
    fire: (event: unknown) => handlers.get('navigate')?.(event),
    settle: () => handlers.get('navigatesuccess')?.(new Event('navigatesuccess')),
    back: vi.fn(),
    forward: vi.fn(),
    canGoBack: false,
    canGoForward: false,
  }
}

function navigateEvent(url: string, overrides: Record<string, unknown> = {}): { event: unknown; attempt: Attempt } {
  const attempt: Attempt = { intercepted: false, handled: [] }
  const event = {
    canIntercept: true,
    hashChange: false,
    downloadRequest: null,
    formData: null,
    destination: { url: new URL(url, 'https://example.test').href },
    intercept: (options: { handler: () => Promise<void> }) => {
      attempt.intercepted = true
      void options.handler().then(() => attempt.handled.push(url))
    },
    ...overrides,
  }

  return { event, attempt }
}

function listening(navigation: FakeNavigation): ReturnType<typeof interceptNavigation> {
  return interceptNavigation({
    navigation: cast<Navigation>(navigation),
    open: async (pathname: string) => {
      opened.push(pathname)
      await Promise.resolve()
    },
  })
}

beforeEach(() => {
  opened = []
})

describe('which navigations are taken over', () => {
  it.each([
    ['a document url', '/doc/journal/a.md'],
    ['the doc root', '/doc/'],
    ['a trash entry', '/trash/aaaa'],
  ])('intercepts %s', (_case, url) => {
    const navigation = fakeNavigation()
    listening(navigation)
    const { event, attempt } = navigateEvent(url)

    navigation.fire(event)

    expect({ intercepted: attempt.intercepted, opened }).toStrictEqual({ intercepted: true, opened: [url] })
  })

  it.each([
    ['a url outside the app, such as the archive', '/api/files/archive'],
    ['the site root before its redirect', '/'],
  ])('leaves %s to the browser', (_case, url) => {
    const navigation = fakeNavigation()
    listening(navigation)
    const { event, attempt } = navigateEvent(url)

    navigation.fire(event)

    expect({ intercepted: attempt.intercepted, opened }).toStrictEqual({ intercepted: false, opened: [] })
  })

  it.each([
    ['one it cannot intercept, which is how a cross-document navigation reads', { canIntercept: false }],
    ['a hash change, which never leaves the document', { hashChange: true }],
    ['a download, which is not a navigation at all', { downloadRequest: 'photo.png' }],
    ['a form submission', { formData: new FormData() }],
  ])('leaves %s alone', (_case, overrides) => {
    const navigation = fakeNavigation()
    listening(navigation)
    const { event, attempt } = navigateEvent('/doc/a.md', overrides)

    navigation.fire(event)

    expect({ intercepted: attempt.intercepted, opened }).toStrictEqual({ intercepted: false, opened: [] })
  })
})

describe('the back and forward controls', () => {
  it('report that there is nowhere to go before anything has been visited', () => {
    const navigation = fakeNavigation()
    const navigator = listening(navigation)

    expect({ back: navigator.canGoBack(), forward: navigator.canGoForward() }).toStrictEqual({
      back: false,
      forward: false,
    })
  })

  it('report what the browser says rather than guessing from history length', () => {
    const navigation = fakeNavigation()
    navigation.canGoBack = true
    navigation.canGoForward = true
    const navigator = listening(navigation)

    expect({ back: navigator.canGoBack(), forward: navigator.canGoForward() }).toStrictEqual({
      back: true,
      forward: true,
    })
  })

  it('goes back when there is somewhere to go back to', () => {
    const navigation = fakeNavigation()
    navigation.canGoBack = true

    listening(navigation).back()

    expect(navigation.back).toHaveBeenCalledTimes(1)
  })

  it('does nothing when there is not, rather than throwing', () => {
    const navigation = fakeNavigation()

    listening(navigation).back()

    expect(navigation.back).not.toHaveBeenCalled()
  })

  it('goes forward when there is somewhere to go forward to', () => {
    const navigation = fakeNavigation()
    navigation.canGoForward = true

    listening(navigation).forward()

    expect(navigation.forward).toHaveBeenCalledTimes(1)
  })

  it('does not go forward off the end of the history', () => {
    const navigation = fakeNavigation()

    listening(navigation).forward()

    expect(navigation.forward).not.toHaveBeenCalled()
  })
})

describe('when the navigation settles', () => {
  it('says so, which is when the buttons can be refreshed truthfully', () => {
    const navigation = fakeNavigation()
    const settled = vi.fn<() => void>()
    interceptNavigation({
      navigation: cast<Navigation>(navigation),
      open: () => Promise.resolve(),
      onSettled: settled,
    })

    navigation.settle()

    expect(settled).toHaveBeenCalledTimes(1)
  })

  it('does not require anyone to be listening', () => {
    const navigation = fakeNavigation()
    listening(navigation)

    expect(() => {
      navigation.settle()
    }).not.toThrow()
  })
})

describe('a browser without the Navigation API', () => {
  it('reports nowhere to go rather than failing to start', () => {
    const navigator = interceptNavigation({ navigation: undefined, open: () => Promise.resolve() })

    expect({ back: navigator.canGoBack(), forward: navigator.canGoForward() }).toStrictEqual({
      back: false,
      forward: false,
    })
  })

  it('has inert controls rather than absent ones', () => {
    const navigator = interceptNavigation({ navigation: undefined, open: () => Promise.resolve() })

    expect(() => {
      navigator.back()
      navigator.forward()
    }).not.toThrow()
  })
})
