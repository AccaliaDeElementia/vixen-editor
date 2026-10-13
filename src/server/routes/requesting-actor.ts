'use sanity'

import { getConnInfo } from '@hono/node-server/conninfo'
import type { Context } from 'hono'

import { anonymousActor, isAddress, type Actor } from '../platform/actor.ts'

const FORWARDED_FOR = 'x-forwarded-for'
const FORWARDED_SEPARATOR = ','
const NO_ADDRESS = ''

function declaredOrigin(c: Context): string | undefined {
  const [originalClient = NO_ADDRESS] = (c.req.header(FORWARDED_FOR) ?? NO_ADDRESS).split(FORWARDED_SEPARATOR)
  const declared = originalClient.trim()

  return isAddress(declared) ? declared : undefined
}

function socketAddress(c: Context): string {
  try {
    return getConnInfo(c).remote.address ?? NO_ADDRESS
  } catch {
    return NO_ADDRESS
  }
}

export function actorOf(c: Context): Actor {
  return anonymousActor(declaredOrigin(c) ?? socketAddress(c))
}
