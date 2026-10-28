export const DEFAULT_RESEND_SECONDS = 60
export const MIN_PASSWORD_LENGTH = 8

type AuthErrorCode =
  | 'unavailable'
  | 'network'
  | 'invalid-credentials'
  | 'invalid-code'
  | 'expired-code'
  | 'too-many-attempts'
  | 'rate-limited'
  | 'send-failed'
  | 'invalid-input'

export type AuthResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: AuthErrorCode; retryAfterSeconds?: number }

/** Parameters of an email-confirmation code issued by the server. */
export interface CodeChallenge {
  codeLength: number
  resendAfterSeconds: number
}

/** The server, not the browser, decides which step comes after the email. */
type IdentifyOutcome =
  | { step: 'password' }
  | { step: 'create-password' }
  | { step: 'verify'; challenge: CodeChallenge }

/**
 * Integration boundary for authentication. Every method maps to one backend
 * endpoint. The server owns password checks, code generation and validation,
 * attempt limits, resend cooldowns, and the session cookie; the browser only
 * renders the outcome. Passwords and codes are sent in request bodies only.
 */
export interface AuthApi {
  /** Decides whether the email is a confirmed account, a new one, or an unfinished sign-up. */
  identify(input: { email: string }): Promise<AuthResult<IdentifyOutcome>>
  /** Signs in a confirmed account; the server sets the session cookie. */
  signIn(input: { email: string; password: string }): Promise<AuthResult<Record<string, never>>>
  /** Creates an unconfirmed registration and sends the first code. */
  register(input: {
    email: string
    password: string
    consentAccepted: true
  }): Promise<AuthResult<{ challenge: CodeChallenge }>>
  /** Confirms the email; `signedIn` is true only if the server actually issued a session. */
  verifyEmail(input: { email: string; code: string }): Promise<AuthResult<{ signedIn: boolean }>>
  /** Sends a new code, respecting the server-side cooldown. */
  resendCode(input: { email: string }): Promise<AuthResult<{ resendAfterSeconds: number }>>
  /** Starts password recovery without revealing whether the account exists. */
  requestPasswordReset(input: { email: string }): Promise<AuthResult<Record<string, never>>>
  resetPassword(input: { token: string; password: string }): Promise<AuthResult<Record<string, never>>>
  currentUser(): Promise<AuthResult<{ id: string; email: string }>>
  signOut(): Promise<AuthResult<Record<string, never>>>
}

export const AUTH_ERROR_MESSAGES: Record<AuthErrorCode, string> = {
  unavailable: 'Это действие временно недоступно. Попробуйте позже.',
  network: 'Не удалось связаться с сервером. Проверьте соединение и повторите попытку.',
  'invalid-credentials': 'Неверная почта или пароль. Проверьте данные и попробуйте снова.',
  'invalid-code': 'Неверный код. Проверьте код из письма и попробуйте снова.',
  'expired-code': 'Срок действия кода истёк. Запросите новый код.',
  'too-many-attempts': 'Слишком много попыток. Запросите новый код или попробуйте позже.',
  'rate-limited': 'Слишком много запросов. Попробуйте чуть позже.',
  'send-failed': 'Не удалось отправить письмо. Попробуйте ещё раз.',
  'invalid-input': 'Проверьте введённые данные и попробуйте снова.',
}

/** Same-origin /api requests are proxied to Spring Boot in local development. */
async function request<T>(path: string, input?: unknown): Promise<AuthResult<T>> {
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (input !== undefined) {
      // Login and logout rotate the session: obtain the current CSRF token each time.
      const csrfResponse = await fetch('/api/auth/csrf', {
        credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(10_000),
      })
      if (!csrfResponse.ok) return { ok: false, error: 'unavailable' }
      const csrf = await csrfResponse.json()
      if (!csrf.ok || !csrf.data?.token || !csrf.data?.headerName) return { ok: false, error: 'unavailable' }
      headers[csrf.data.headerName] = csrf.data.token
    }
    const response = await fetch(`/api/auth/${path}`, {
      method: input === undefined ? 'GET' : 'POST',
      credentials: 'same-origin', cache: 'no-store', headers,
      body: input === undefined ? undefined : JSON.stringify(input),
      signal: AbortSignal.timeout(15_000),
    })
    const body = await response.json()
    if (response.ok && body.ok === true) return { ok: true, data: body.data as T }
    if (body.ok === false && Object.hasOwn(AUTH_ERROR_MESSAGES, body.error)) {
      return { ok: false, error: body.error, retryAfterSeconds: body.retryAfterSeconds }
    }
    return { ok: false, error: 'unavailable' }
  } catch {
    return { ok: false, error: 'network' }
  }
}

const httpAuthApi: AuthApi = {
  identify: (input) => request('identify', input),
  signIn: (input) => request('sign-in', input),
  register: (input) => request('register', input),
  verifyEmail: (input) => request('verify-email', input),
  resendCode: (input) => request('resend-code', input),
  requestPasswordReset: (input) => request('request-password-reset', input),
  resetPassword: (input) => request('reset-password', input),
  currentUser: () => request('me'),
  signOut: () => request('sign-out', {}),
}

export async function getAuthApi(): Promise<AuthApi> {
  return httpAuthApi
}
