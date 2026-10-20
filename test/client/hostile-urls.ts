'use sanity'

/* eslint-disable no-script-url -- these literals are the subject of the control that
   refuses script URLs, not a destination anything navigates to. */

export const SCRIPT_URL = 'javascript:alert(1)'
export const SCRIPT_URL_IN_CAPITALS = 'JavaScript:alert(1)'

/* eslint-enable no-script-url */
