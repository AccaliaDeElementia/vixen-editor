'use sanity'

import { isIP } from 'node:net'
import { userInfo } from 'node:os'

type ActorKind = 'local' | 'unauthenticated' | 'unknown'

export interface Actor {
  id: string
  name: string
  kind: ActorKind
}

interface SystemUser {
  uid: number
  username: string
}

const ACTOR_KINDS: readonly ActorKind[] = ['local', 'unauthenticated', 'unknown']
const ANONYMOUS_NAME = 'Anonymous User'
const UNKNOWN_NAME = 'Unknown Actor'
const UNKNOWN_ADDRESS = 'unknown'
const NOT_AN_ADDRESS = 0

export function isActorKind(value: unknown): value is ActorKind {
  return ACTOR_KINDS.some((kind) => kind === value)
}

export function isAddress(candidate: string): boolean {
  return isIP(candidate) !== NOT_AN_ADDRESS
}

export function anonymousActor(candidate: string): Actor {
  const address = isAddress(candidate) ? candidate : UNKNOWN_ADDRESS

  return { id: `unauth:${address}`, name: ANONYMOUS_NAME, kind: 'unauthenticated' }
}

export function unknownActor(id: string): Actor {
  return { id, name: UNKNOWN_NAME, kind: 'unknown' }
}

export function localActor(user: SystemUser = userInfo()): Actor {
  return { id: `local:${String(user.uid)}`, name: user.username, kind: 'local' }
}
