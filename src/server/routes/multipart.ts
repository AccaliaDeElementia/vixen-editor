'use sanity'

import { Busboy } from '@fastify/busboy'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

const NO_BYTES = 0
const ONE_BYTE = 1

export class BodyTooLargeError extends Error {
  constructor(limitBytes: number) {
    super(`body exceeds ${String(limitBytes)} bytes`)
    this.name = 'BodyTooLargeError'
  }
}

export interface ReceivedFile {
  name: string
  filename: string
  bytes: Uint8Array
}

export interface ReceivedBody {
  fields: Record<string, string>
  files: ReceivedFile[]
}

function joined(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, NO_BYTES)
  const bytes = new Uint8Array(total)
  let at = NO_BYTES
  for (const chunk of chunks) {
    bytes.set(chunk, at)
    at += chunk.length
  }

  return bytes
}

export async function receiveMultipart(request: Request, maxBytes: number): Promise<ReceivedBody> {
  const { body } = request
  if (body === null) throw new TypeError('the request carried no body')

  const refuseFrom = maxBytes + ONE_BYTE
  const parts = new Busboy({
    headers: { 'content-type': request.headers.get('content-type') ?? '' },
    limits: { fileSize: refuseFrom },
    preservePath: true,
  })
  const received: ReceivedBody = { fields: {}, files: [] }
  const settled: PromiseWithResolvers<ReceivedBody> = Promise.withResolvers()

  parts.on('field', (name: string, value: string) => {
    received.fields[name] = value
  })

  parts.on('file', (name: string, stream: Readable, filename: string) => {
    const chunks: Uint8Array[] = []
    stream.on('data', (chunk: Uint8Array) => {
      chunks.push(chunk)
    })
    stream.on('limit', () => {
      settled.reject(new BodyTooLargeError(maxBytes))
    })
    stream.on('end', () => {
      received.files.push({ name, filename, bytes: joined(chunks) })
    })
  })

  parts.on('finish', () => {
    settled.resolve(received)
  })

  pipeline(Readable.fromWeb(body), parts).catch((error: unknown) => {
    settled.reject(error)
  })

  return await settled.promise
}
