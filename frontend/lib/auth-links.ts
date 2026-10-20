/**
 * Legacy `?mode=login` and `?mode=signup` links keep working: /auth/ is a single
 * entry point and ignores `mode`, so the server decides between sign-in and sign-up.
 */
export const AUTH_LOGIN_URL = '/auth/?mode=login'

/** Entry that returns the user to the account afterwards (the presentation editor is not implemented yet). */
export const AUTH_SIGNUP_URL = '/auth/?mode=signup&returnTo=%2Faccount%2F'

/** Only same-origin relative paths are accepted as a post-auth destination. */
export function parseReturnTo(value: string | null | undefined): string | null {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return null
  return value
}
