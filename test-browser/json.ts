'use sanity'

import { isRecord } from '../src/shared/guards.ts'

export async function stringFieldOf(response: { json: () => Promise<unknown> }, key: string): Promise<string> {
  const body: unknown = await response.json()
  if (!isRecord(body) || typeof body[key] !== 'string') {
    throw new Error(`response body has no string ${key}`)
  }

  return body[key]
}
