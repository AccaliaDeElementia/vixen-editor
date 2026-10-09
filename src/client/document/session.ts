'use sanity'

import { basenameOf } from '../../shared/link-paths.ts'

import { DocumentRequestError, WHILE_LEAVING, type DocumentClient } from './document-client.ts'

const HTTP_NOT_FOUND = 404

export interface LoadedDocument {
  content: string
  stored: boolean
}

export interface Session {
  load: (id: string) => Promise<LoadedDocument>
  save: (id: string, content: string) => Promise<void>
  saveOnUnload: (id: string, content: string) => void
  reread: (id: string) => Promise<LoadedDocument | null>
  rename: (from: string, to: string) => void
}

function isAbsent(error: unknown): boolean {
  return error instanceof DocumentRequestError && error.status === HTTP_NOT_FOUND
}

function defaultTemplate(id: string): string {
  const name = basenameOf(id).replace(/\.[^.\/]+$/v, '')
  return `# ${name}\n\nTODO: start writing.\n`
}

export function createSession(client: DocumentClient, template: (id: string) => string = defaultTemplate): Session {
  const etags = new Map<string, string>()

  return {
    async load(id: string): Promise<LoadedDocument> {
      try {
        const { content, etag } = await client.read(id)
        etags.set(id, etag)
        return { content, stored: true }
      } catch (error) {
        if (!isAbsent(error)) throw error

        etags.delete(id)
        return { content: template(id), stored: false }
      }
    },

    async reread(id: string): Promise<LoadedDocument | null> {
      const etag = etags.get(id)
      if (etag === undefined) return null

      const loaded = await client.readIfChanged(id, etag)
      if (loaded === null) return null

      etags.set(id, loaded.etag)

      return { content: loaded.content, stored: true }
    },

    rename(from: string, to: string): void {
      const etag = etags.get(from)
      etags.delete(from)
      if (etag !== undefined) etags.set(to, etag)
    },

    async save(id: string, content: string): Promise<void> {
      const etag = etags.get(id)
      const neverReachedTheServer = etag === undefined
      const next = neverReachedTheServer ? await client.create(id, content) : await client.save(id, content, etag)

      etags.set(id, next)
    },

    saveOnUnload(id: string, content: string): void {
      const etag = etags.get(id)
      const neverReachedTheServer = etag === undefined
      const sending = neverReachedTheServer
        ? client.create(id, content, WHILE_LEAVING)
        : client.save(id, content, etag, WHILE_LEAVING)

      void sending
        .then((next) => {
          etags.set(id, next)
        })
        .catch(() => undefined)
    },
  }
}

export const TestOnly = { defaultTemplate }
