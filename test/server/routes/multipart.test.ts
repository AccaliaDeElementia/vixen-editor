'use sanity'

import { describe, expect, it } from 'vitest'

import { BodyTooLargeError, receiveMultipart } from '../../../src/server/routes/multipart.ts'

const GENEROUS = 1024
const TINY = 8
const NOTHING_SENT = 0
const FILLER = 65

function posted(form: FormData): Request {
  return new Request('http://editor.invalid/uploads', { method: 'POST', body: form })
}

function withFile(bytes: Uint8Array<ArrayBuffer>, filename = 'photo.png', field = 'file'): FormData {
  const form = new FormData()
  form.append(field, new File([bytes], filename))

  return form
}

function bytesOf(count: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(new ArrayBuffer(count))
  bytes.fill(FILLER)

  return bytes
}

describe('reading the parts of a multipart body', () => {
  it('reads a text part as a field', async () => {
    const form = withFile(bytesOf(4))
    form.append('path', 'journal')

    expect((await receiveMultipart(posted(form), GENEROUS)).fields).toStrictEqual({ path: 'journal' })
  })

  it('reads a file part as bytes', async () => {
    const received = await receiveMultipart(posted(withFile(bytesOf(4))), GENEROUS)

    expect(received.files.at(0)?.bytes).toStrictEqual(bytesOf(4))
  })

  it('names the field a file arrived under, so a caller can tell which part it was', async () => {
    const received = await receiveMultipart(posted(withFile(bytesOf(4))), GENEROUS)

    expect(received.files.at(0)?.name).toBe('file')
  })

  it('names the file as the client called it', async () => {
    const received = await receiveMultipart(posted(withFile(bytesOf(4), 'notes.md')), GENEROUS)

    expect(received.files.at(0)?.filename).toBe('notes.md')
  })

  it('reads a part sent as a blob as a file, not as a field', async () => {
    const form = withFile(bytesOf(4))
    form.append('filename', new Blob(['sneaky']))

    const received = await receiveMultipart(posted(form), GENEROUS)

    expect(received.files.map((part) => part.name)).toStrictEqual(['file', 'filename'])
  })

  it('reports no files when the body carried none', async () => {
    const form = new FormData()
    form.append('path', 'journal')

    expect((await receiveMultipart(posted(form), GENEROUS)).files).toHaveLength(NOTHING_SENT)
  })
})

describe('a body larger than the caller allows', () => {
  it('is refused rather than read to the end', async () => {
    await expect(receiveMultipart(posted(withFile(bytesOf(TINY * 4))), TINY)).rejects.toBeInstanceOf(BodyTooLargeError)
  })

  it('is allowed through at exactly the limit, which is the size the caller said yes to', async () => {
    const received = await receiveMultipart(posted(withFile(bytesOf(TINY))), TINY)

    expect(received.files.at(0)?.bytes).toHaveLength(TINY)
  })

  it('counts a file across its chunks rather than one chunk at a time', async () => {
    await expect(receiveMultipart(posted(withFile(bytesOf(GENEROUS * 8))), GENEROUS)).rejects.toBeInstanceOf(
      BodyTooLargeError,
    )
  })
})

describe('a body that stops arriving', () => {
  it('is refused rather than awaited forever, because the sender went away', async () => {
    const failing = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.error(new Error('the sender went away'))
      },
    })
    const request = new Request('http://editor.invalid/uploads', {
      method: 'POST',
      headers: { 'content-type': 'multipart/form-data; boundary=x' },
      body: failing,
      duplex: 'half',
    })

    await expect(receiveMultipart(request, GENEROUS)).rejects.toThrow()
  })
})

describe('a body that is not multipart at all', () => {
  it('is refused, because there is nothing to take parts from', async () => {
    const request = new Request('http://editor.invalid/uploads', { method: 'POST', body: 'plain text' })

    await expect(receiveMultipart(request, GENEROUS)).rejects.toThrow()
  })

  it('is refused when it declares no content type, because there is no boundary to split on', async () => {
    const streamed = new ReadableStream<Uint8Array>({
      start: (controller) => {
        controller.close()
      },
    })
    const request = new Request('http://editor.invalid/uploads', {
      method: 'POST',
      body: streamed,
      duplex: 'half',
    })

    await expect(receiveMultipart(request, GENEROUS)).rejects.toThrow()
  })

  it('is refused when it carries no body, rather than read as empty', async () => {
    const request = new Request('http://editor.invalid/uploads', { method: 'POST' })

    await expect(receiveMultipart(request, GENEROUS)).rejects.toThrow()
  })
})
