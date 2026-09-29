'use sanity'

import { isRecord } from '../../../src/shared/guards.ts'

export interface Refusal {
  status: number
  code: unknown
}

export async function fieldOf(res: Response, key: string): Promise<unknown> {
  const body: unknown = await res.json()

  return isRecord(body) ? body[key] : undefined
}

export async function refusalOf(res: Response): Promise<Refusal> {
  return { status: res.status, code: await fieldOf(res, 'code') }
}
