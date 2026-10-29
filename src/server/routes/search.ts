'use sanity'

import { Hono } from 'hono'

import { compareNamesIn } from '../storage/primitives/name-order.ts'
import type { DocumentStore } from '../storage/fs-store.ts'
import { searchStore } from '../storage/search.ts'

import { ACCEPT_LANGUAGE, preferredLocale, VARIES_BY_LANGUAGE } from './accept-language.ts'
import { invalidQuery } from './error-response.ts'

const HTTP_OK = 200
const NOTHING_ASKED = ''

export function searchRoutes(store: DocumentStore): Hono {
  const routes = new Hono()

  routes.get('/', async (c) => {
    const query = c.req.query('q') ?? NOTHING_ASKED
    if (query === NOTHING_ASKED) return invalidQuery(c)

    const byName = compareNamesIn(preferredLocale(c.req.header(ACCEPT_LANGUAGE)))

    return c.json(await searchStore(store, { query, byName }), HTTP_OK, VARIES_BY_LANGUAGE)
  })

  return routes
}
