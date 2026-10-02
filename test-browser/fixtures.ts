'use sanity'

import { expect, type APIRequestContext } from '@playwright/test'

import { DECODABLE_64PX_PNG_BYTES } from './png.ts'
import { stringFieldOf } from './json.ts'

export function newDocument(name: string): string {
  return `/doc/${name}`
}

export async function storedDocument(request: APIRequestContext, name: string, content = '# seed'): Promise<string> {
  await request.post('/api/files/documents', { data: { path: name, content } })

  return newDocument(name)
}

export async function deletedEntry(request: APIRequestContext, name: string): Promise<string> {
  await request.post('/api/files/documents', { data: { path: name, content: '# gone' } })

  return await stringFieldOf(await request.delete(`/api/files/entries/${name}`), 'trashId')
}

export async function storedImage(request: APIRequestContext, name: string, directory = ''): Promise<string> {
  const stored = await request.post('/api/files/uploads', {
    multipart: { path: directory, file: { name, mimeType: 'image/png', buffer: DECODABLE_64PX_PNG_BYTES } },
  })
  expect(stored.status()).toBe(201)

  return `/doc/${await stringFieldOf(stored, 'path')}`
}
