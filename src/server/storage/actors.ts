'use sanity'

import fs from 'node:fs/promises'
import path from 'node:path'

import { isActorKind, localActor, unknownActor, type Actor } from '../platform/actor.ts'
import type { WriteLock } from '../platform/lock.ts'
import { createLogger } from '../platform/logging.ts'

import { nullWhenAbsent } from './primitives/absence.ts'
import { replaceFileAtomic } from './primitives/atomic-write.ts'
import { isRecord } from '../../shared/guards.ts'

const VIXEN_DIRECTORY = '.vixen'
const ACTORS_NAME = 'actors.json'
const INDENTED = 2

const logUnreadable = createLogger('storage/actors', 'unreadable')
const logDiscarded = createLogger('storage/actors', 'discarded')
const logMissing = createLogger('storage/actors', 'missing')

export interface Actors {
  resolve: (id: string) => Promise<Actor>
  remember: (actor: Actor) => Promise<void>
}

function actorIn(id: string, value: unknown): Actor | null {
  if (!isRecord(value)) return null

  const { name, kind } = value

  return typeof name === 'string' && isActorKind(kind) ? { id, name, kind } : null
}

function actorsIn(parsed: unknown): Map<string, Actor> {
  const known = new Map<string, Actor>()
  if (!isRecord(parsed)) return known

  for (const [id, value] of Object.entries(parsed)) {
    const actor = actorIn(id, value)
    if (actor === null) logDiscarded('%s is not an actor record', id)
    else known.set(id, actor)
  }

  return known
}

function recordOf(known: Map<string, Actor>): Record<string, { name: string; kind: Actor['kind'] }> {
  return Object.fromEntries([...known].map(([id, { name, kind }]) => [id, { name, kind }]))
}

export function createActors(docsRoot: string, lock: WriteLock): Actors {
  const file = path.join(path.resolve(docsRoot), VIXEN_DIRECTORY, ACTORS_NAME)
  const resident = localActor()
  let loading: Promise<Map<string, Actor>> | null = null

  async function readKnown(): Promise<Map<string, Actor>> {
    const raw = await nullWhenAbsent(async () => await fs.readFile(file, 'utf8'))
    if (raw === null) return new Map()

    try {
      return actorsIn(JSON.parse(raw))
    } catch {
      logUnreadable('%s does not hold JSON, so it is being rebuilt', file)
      return new Map()
    }
  }

  async function readKnownAndResident(): Promise<Map<string, Actor>> {
    return (await readKnown()).set(resident.id, resident)
  }

  async function loaded(): Promise<Map<string, Actor>> {
    loading ??= readKnownAndResident()

    return await loading
  }

  async function write(entries: Map<string, Actor>): Promise<void> {
    await fs.mkdir(path.dirname(file), { recursive: true })
    await replaceFileAtomic(file, JSON.stringify(recordOf(entries), null, INDENTED))
  }

  return {
    async resolve(id: string): Promise<Actor> {
      const found = (await loaded()).get(id)
      if (found !== undefined) return found

      logMissing('no record of %s, so it is reported as unknown', id)

      return unknownActor(id)
    },

    async remember(actor: Actor): Promise<void> {
      const entries = await loaded()
      const held = entries.get(actor.id)
      if (held?.name === actor.name && held.kind === actor.kind) return

      entries.set(actor.id, actor)
      await lock.run(async () => {
        await write(entries)
      })
    },
  }
}
