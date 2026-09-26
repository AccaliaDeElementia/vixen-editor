'use sanity'

import { PAST_SEPARATOR } from '../../shared/sequences.ts'

import { Hono } from 'hono'

import { classifyFile } from '../../shared/documents.ts'
import { DOC_PREFIX, TRASH_PREFIX } from '../../shared/page-urls.ts'

const HTTP_FOUND = 302

function folderRedirectTarget(rest: string): string | null {
  if (rest === '' || rest.endsWith('/')) return null

  const leaf = rest.slice(rest.lastIndexOf('/') + PAST_SEPARATOR)

  return classifyFile(leaf) === null ? `${DOC_PREFIX}${rest}/` : null
}

export function pageRoutes(renderShell: () => string): Hono {
  const routes = new Hono()

  routes.get('/', (c) => c.redirect(DOC_PREFIX, HTTP_FOUND))
  routes.get('/doc', (c) => c.redirect(DOC_PREFIX, HTTP_FOUND))

  routes.get('/doc/:rest{.*}', (c) => {
    const target = folderRedirectTarget(c.req.param('rest'))
    if (target !== null) return c.redirect(target, HTTP_FOUND)

    return c.html(renderShell())
  })

  routes.get(`${TRASH_PREFIX}:entryId`, (c) => c.html(renderShell()))

  return routes
}

export const TestOnly = { DOC_PREFIX, folderRedirectTarget }
