'use sanity'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createDialogs } from '../../src/client/files/dialogs.ts'

function page(): void {
  document.body.innerHTML = `
    <dialog id="file-dialog">
      <form method="dialog">
        <h2 id="file-dialog-title"></h2>
        <p id="file-dialog-message"></p>
        <p id="file-dialog-field">
          <label id="file-dialog-label" for="file-dialog-entry">Name</label>
          <input id="file-dialog-entry" type="text">
        </p>
        <p id="file-dialog-error"></p>
        <button id="file-dialog-cancel" type="submit" value="cancel">Cancel</button>
        <button id="file-dialog-confirm" type="submit" value="confirm"></button>
      </form>
    </dialog>`
}

function dialog(): HTMLDialogElement {
  const element = document.querySelector<HTMLDialogElement>('#file-dialog')
  if (element === null) throw new Error('missing dialog')
  return element
}

function type(value: string): void {
  const input = document.querySelector<HTMLInputElement>('#file-dialog-entry')
  if (input === null) throw new Error('missing input')
  input.value = value
}

function click(selector: string): void {
  document.querySelector<HTMLButtonElement>(selector)?.click()
}

function errorText(): string {
  return document.querySelector('#file-dialog-error')?.textContent ?? ''
}

beforeEach(() => {
  page()
})

describe('prompt', () => {
  it('resolves true once the submission succeeds', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({
      title: 'New',
      label: 'Name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve(null),
    })

    type('notes.md')
    click('#file-dialog-confirm')

    await expect(pending).resolves.toBe(true)
  })

  it('hands the typed value to the submission, trimmed', async () => {
    const submit = vi.fn().mockResolvedValue(null)
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit })

    type('  notes.md  ')
    click('#file-dialog-confirm')
    await pending

    expect(submit).toHaveBeenCalledWith('notes.md')
  })

  it('resolves false on cancel without submitting', async () => {
    const submit = vi.fn()
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit })

    click('#file-dialog-cancel')

    await expect(pending).resolves.toBe(false)
    expect(submit).not.toHaveBeenCalled()
  })

  it('shows the title and the confirm label it was given', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({
      title: 'New folder',
      label: 'Name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve(null),
    })

    expect(document.querySelector('#file-dialog-title')?.textContent).toBe('New folder')
    expect(document.querySelector('#file-dialog-confirm')?.textContent).toBe('Create')
  })

  it('opens the dialog modally', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: () => Promise.resolve(null) })

    expect(dialog().open).toBe(true)
  })

  it('stays open and shows the reason when the submission is rejected', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({
      title: 'New',
      label: 'Name',
      confirmLabel: 'Create',
      submit: (value) => Promise.resolve(value === 'taken.md' ? 'Already exists' : null),
    })

    type('taken.md')
    click('#file-dialog-confirm')
    await vi.waitFor(() => {
      expect(errorText()).toBe('Already exists')
    })

    expect(dialog().open).toBe(true)

    type('free.md')
    click('#file-dialog-confirm')
    await expect(pending).resolves.toBe(true)
  })

  it('clears a stale error when it opens again', async () => {
    const dialogs = createDialogs(document)
    const first = dialogs.prompt({
      title: 'New',
      label: 'Name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve('nope'),
    })
    type('a.md')
    click('#file-dialog-confirm')
    await vi.waitFor(() => {
      expect(errorText()).toBe('nope')
    })
    click('#file-dialog-cancel')
    await first

    void dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: () => Promise.resolve(null) })

    expect(errorText()).toBe('')
  })

  it('labels the field with what it is asking for, not a bare "Name"', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({
      title: 'New folder',
      label: 'Folder name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve(null),
    })

    expect(document.querySelector('#file-dialog-label')?.textContent).toBe('Folder name')
  })

  it('shows the name field', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: () => Promise.resolve(null) })

    expect(document.querySelector<HTMLElement>('#file-dialog-field')?.hidden).toBe(false)
  })

  it('starts from a given value', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({
      title: 'Rename',
      label: 'Name',
      confirmLabel: 'Rename',
      value: 'old.md',
      submit: () => Promise.resolve(null),
    })

    expect(document.querySelector<HTMLInputElement>('#file-dialog-entry')?.value).toBe('old.md')
  })
})

describe('confirm', () => {
  it('resolves true when confirmed', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.confirm({ title: 'Delete', message: 'Sure?', confirmLabel: 'Delete' })

    click('#file-dialog-confirm')

    await expect(pending).resolves.toBe(true)
  })

  it('resolves false when cancelled', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.confirm({ title: 'Delete', message: 'Sure?', confirmLabel: 'Delete' })

    click('#file-dialog-cancel')

    await expect(pending).resolves.toBe(false)
  })

  it('shows the message and hides the name field', () => {
    const dialogs = createDialogs(document)
    void dialogs.confirm({ title: 'Delete', message: 'notes.md will go to the trash', confirmLabel: 'Delete' })

    expect(document.querySelector('#file-dialog-message')?.textContent).toBe('notes.md will go to the trash')
    expect(document.querySelector<HTMLElement>('#file-dialog-field')?.hidden).toBe(true)
  })
})

describe('a page without the dialog markup', () => {
  it('declines a prompt rather than throwing', async () => {
    document.body.innerHTML = '<p>nothing here</p>'

    await expect(
      createDialogs(document).prompt({
        title: 'x',
        label: 'y',
        confirmLabel: 'z',
        submit: () => Promise.resolve(null),
      }),
    ).resolves.toBe(false)
  })

  it('declines when the dialog is there but its input is missing', async () => {
    document.body.innerHTML = `
      <dialog id="file-dialog">
        <h2 id="file-dialog-title"></h2>
        <p id="file-dialog-message"></p>
        <p id="file-dialog-field"></p>
      </dialog>`

    await expect(
      createDialogs(document).prompt({
        title: 'x',
        label: 'y',
        confirmLabel: 'z',
        submit: () => Promise.resolve(null),
      }),
    ).resolves.toBe(false)
  })

  it('declines a confirm rather than throwing', async () => {
    document.body.innerHTML = '<p>nothing here</p>'

    await expect(createDialogs(document).confirm({ title: 'x', message: 'y', confirmLabel: 'z' })).resolves.toBe(false)
  })
})

describe('closing without a form', () => {
  it('confirms when Enter is pressed in the field', async () => {
    const dialogs = createDialogs(document)
    const pending = dialogs.prompt({
      title: 'New',
      label: 'Name',
      confirmLabel: 'Create',
      submit: () => Promise.resolve(null),
    })

    type('notes.md')
    document
      .querySelector('#file-dialog-entry')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))

    await expect(pending).resolves.toBe(true)
  })

  it('ignores other keys in the field', () => {
    const dialogs = createDialogs(document)
    void dialogs.prompt({ title: 'New', label: 'Name', confirmLabel: 'Create', submit: () => Promise.resolve(null) })

    document
      .querySelector('#file-dialog-entry')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true }))

    expect(dialog().open).toBe(true)
  })

  it('declines when the markup has buttons missing', async () => {
    document.body.innerHTML = `
      <dialog id="file-dialog">
        <h2 id="file-dialog-title"></h2>
        <p id="file-dialog-message"></p>
        <p id="file-dialog-field"><label id="file-dialog-label"></label><input id="file-dialog-entry"></p>
        <p id="file-dialog-error"></p>
      </dialog>`

    await expect(createDialogs(document).confirm({ title: 'x', message: 'y', confirmLabel: 'z' })).resolves.toBe(false)
  })
})
