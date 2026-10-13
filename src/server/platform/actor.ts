'use sanity'

import { isIP } from 'node:net'

type ActorKind = 'local' | 'unauthenticated' | 'unknown'

export interface Actor {
  id: string
  name: string
  kind: ActorKind
}

const ANONYMOUS_NAME = 'Anonymous User'
const UNKNOWN_ADDRESS = 'unknown'
const NOT_AN_ADDRESS = 0

export function isAddress(candidate: string): boolean {
  return isIP(candidate) !== NOT_AN_ADDRESS
}

export function anonymousActor(candidate: string): Actor {
  const address = isAddress(candidate) ? candidate : UNKNOWN_ADDRESS

  return { id: `unauth:${address}`, name: ANONYMOUS_NAME, kind: 'unauthenticated' }
}
