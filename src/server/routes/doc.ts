'use sanity'

import { Hono } from 'hono'

import { classifyFile } from '../storage/tree.ts'

const HTTP_FOUND = 302

const DOC_PREFIX = '/doc/'

// A folder URL has to carry a trailing slash: at /doc/journal/2026 a relative
// link like ./image.png resolves against /doc/journal, the wrong directory.
// The leaf is a folder when it names no file the app can open, which catches
// a folder called v1.2 that a bare extension test would read as a file.
function folderRedirectTarget(rest: string): string | null {
  if (rest === '' || rest.endsWith('/')) return null

  const leaf = rest.slice(rest.lastIndexOf('/') + 1)

  return classifyFile(leaf) === null ? `${DOC_PREFIX}${rest}/` : null
}

export function docRoutes(renderShell: () => string): Hono {
  const routes = new Hono()

  // 302 rather than 301: a permanent redirect is cached indefinitely, and
  // these targets are a URL scheme that may still move.
  routes.get('/', (c) => c.redirect(DOC_PREFIX, HTTP_FOUND))
  routes.get('/doc', (c) => c.redirect(DOC_PREFIX, HTTP_FOUND))

  routes.get('/doc/:rest{.*}', (c) => {
    const target = folderRedirectTarget(c.req.param('rest'))
    if (target !== null) return c.redirect(target, HTTP_FOUND)

    return c.html(renderShell())
  })

  return routes
}

export const TestOnly = { DOC_PREFIX, folderRedirectTarget }
