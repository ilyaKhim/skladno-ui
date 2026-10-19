export const DEFAULT_CODE_LENGTH = 6
export const DEFAULT_RESEND_SECONDS = 60
export const MIN_PASSWORD_LENGTH = 8

export type AuthErrorCode =
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
export type IdentifyOutcome =
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

const unavailable: AuthResult<never> = { ok: false, error: 'unavailable' }

/**
 * Used wherever no authentication backend is connected. It never creates an
 * account, a session, or a confirmation code.
 */
const unavailableApi: AuthApi = {
  identify: async () => unavailable,
  signIn: async () => unavailable,
  register: async () => unavailable,
  verifyEmail: async () => unavailable,
  resendCode: async () => unavailable,
  requestPasswordReset: async () => unavailable,
}

let cachedApi: AuthApi | null = null

/**
 * Replace the body with the real HTTP implementation once the backend exists.
 * The local demo adapter is reachable only in development with
 * NEXT_PUBLIC_AUTH_DEMO=1; both conditions are compiled out of production builds.
 */
export async function getAuthApi(): Promise<AuthApi> {
  if (cachedApi) return cachedApi
  if (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_AUTH_DEMO === '1') {
    cachedApi = (await import('@/lib/auth-demo-api')).demoAuthApi
  } else {
    cachedApi = unavailableApi
  }
  return cachedApi
}
