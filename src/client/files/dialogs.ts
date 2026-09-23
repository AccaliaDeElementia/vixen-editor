'use sanity'

export const DIALOG_SELECTOR = '#file-dialog'

const CONFIRM_VALUE = 'confirm'

export interface PromptRequest {
  title: string
  label: string
  confirmLabel: string
  value?: string
  // Returns a message to show inside the still-open dialog, or null on success.
  // Keeping the dialog open is the point: a rejected name is corrected where it
  // was typed rather than announced somewhere else after the dialog has gone.
  submit: (value: string) => Promise<string | null>
}

export interface ConfirmRequest {
  title: string
  message: string
  confirmLabel: string
}

export interface Dialogs {
  prompt: (request: PromptRequest) => Promise<boolean>
  confirm: (request: ConfirmRequest) => Promise<boolean>
}

interface Parts {
  dialog: HTMLDialogElement
  title: HTMLElement
  message: HTMLElement
  field: HTMLElement
  input: HTMLInputElement
  error: HTMLElement
  confirm: HTMLElement
}

function partsOf(root: ParentNode): Parts | null {
  const dialog = root.querySelector<HTMLDialogElement>(DIALOG_SELECTOR)
  const title = root.querySelector<HTMLElement>('#file-dialog-title')
  const message = root.querySelector<HTMLElement>('#file-dialog-message')
  const field = root.querySelector<HTMLElement>('#file-dialog-field')
  const input = root.querySelector<HTMLInputElement>('#file-dialog-input')
  const error = root.querySelector<HTMLElement>('#file-dialog-error')
  const confirm = root.querySelector<HTMLElement>('#file-dialog-confirm')

  if (dialog === null || title === null || message === null || field === null) return null
  if (input === null || error === null || confirm === null) return null

  return { dialog, title, message, field, input, error, confirm }
}

async function settled(dialog: HTMLDialogElement): Promise<string> {
  /* eslint-disable-next-line promise/avoid-new -- a dialog settles when the
     user closes it, which is an event in a later frame rather than a value any
     composition of existing promises can produce */
  return await new Promise<string>((resolve) => {
    dialog.addEventListener(
      'close',
      () => {
        resolve(dialog.returnValue)
      },
      { once: true },
    )
  })
}

function reset(parts: Parts, heading: string, confirmLabel: string): void {
  const { title, error, confirm } = parts

  title.textContent = heading
  error.textContent = ''
  confirm.textContent = confirmLabel
}

async function promptWith(parts: Parts, request: PromptRequest): Promise<boolean> {
  const { dialog, message, field, input, error } = parts

  reset(parts, request.title, request.confirmLabel)
  message.textContent = ''
  field.hidden = false
  input.value = request.value ?? ''
  dialog.showModal()

  for (;;) {
    /* eslint-disable-next-line no-await-in-loop -- the loop is the dialog
       staying open across a rejected name, so each turn waits on the user */
    const outcome = await settled(dialog)
    if (outcome !== CONFIRM_VALUE) return false

    /* eslint-disable-next-line no-await-in-loop -- as above: one submission is
       attempted at a time, because the user makes them one at a time */
    const failure = await request.submit(input.value.trim())
    if (failure === null) return true

    error.textContent = failure
    dialog.showModal()
  }
}

async function confirmWith(parts: Parts, request: ConfirmRequest): Promise<boolean> {
  const { dialog, message, field } = parts

  reset(parts, request.title, request.confirmLabel)
  message.textContent = request.message
  field.hidden = true
  dialog.showModal()

  return (await settled(dialog)) === CONFIRM_VALUE
}

export function createDialogs(root: ParentNode = document): Dialogs {
  const parts = partsOf(root)

  return {
    async prompt(request: PromptRequest): Promise<boolean> {
      return parts === null ? false : await promptWith(parts, request)
    },

    async confirm(request: ConfirmRequest): Promise<boolean> {
      return parts === null ? false : await confirmWith(parts, request)
    },
  }
}
