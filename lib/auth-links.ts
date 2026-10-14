export type AuthMode = 'signup' | 'login'

export const DEFAULT_AUTH_MODE: AuthMode = 'signup'

export const AUTH_LOGIN_URL = '/auth/?mode=login'

/** Sign-up entry that returns the user to the presentation creator afterwards. */
export const AUTH_SIGNUP_URL = '/auth/?mode=signup&returnTo=%2Fcreate'

/** A missing or unknown `mode` always opens the sign-up form. */
export function parseAuthMode(value: string | null | undefined): AuthMode {
  return value === 'login' || value === 'signup' ? value : DEFAULT_AUTH_MODE
}

/** Only same-origin relative paths are accepted as a post-auth destination. */
export function parseReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return null
  return value
}
