'use sanity'

/* eslint-disable no-script-url -- These are the fixtures for the control that
   refuses script URLs, so the literal is the subject under test rather than a
   destination anything navigates to. Assembling them from fragments at the call
   sites was tried first and rejected: it hides the exact string the control
   must refuse, which is the one thing a reader of those tests needs to see.
   Collecting them here keeps that to a single suppression rather than one per
   spec. */

export const SCRIPT_URL = 'javascript:alert(1)'
export const SCRIPT_URL_IN_CAPITALS = 'JavaScript:alert(1)'

/* eslint-enable no-script-url */
