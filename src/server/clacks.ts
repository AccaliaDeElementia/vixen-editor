'use sanity'

import type { Http2Bindings, HttpBindings } from '@hono/node-server'

const CLACKS_HEADER = 'X-Clacks-Overhead'
const CLACKS_VALUE = 'GNU Terry Pratchett'

type NodeBindings = HttpBindings | Http2Bindings
type Dispatch = (request: Request, env: NodeBindings) => Response | Promise<Response>

export function withClacks(dispatch: Dispatch): Dispatch {
  return (request, env): Response | Promise<Response> => {
    env.outgoing.setHeader(CLACKS_HEADER, CLACKS_VALUE)

    return dispatch(request, env)
  }
}

export const TestOnly = { CLACKS_HEADER, CLACKS_VALUE }
