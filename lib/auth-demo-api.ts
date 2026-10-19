import type { AuthApi, AuthResult } from '@/lib/auth-client'

/**
 * Development-only adapter for exercising the UI states locally. It is loaded
 * exclusively when NODE_ENV !== 'production' and NEXT_PUBLIC_AUTH_DEMO=1, and it
 * never runs in a production build.
 *
 * Emails containing "existing" go to the password step (password: demo-password),
 * "pending" resumes confirmation, anything else registers. The code is 123456.
 */
const DEMO_PASSWORD = 'demo-password'
const DEMO_CODE = '123456'
const CHALLENGE = { codeLength: 6, resendAfterSeconds: 60 }

const delay = () => new Promise((resolve) => setTimeout(resolve, 400))
const ok = <T>(data: T): AuthResult<T> => ({ ok: true, data })

let attempts = 0

export const demoAuthApi: AuthApi = {
  async identify({ email }) {
    await delay()
    if (email.includes('existing')) return ok({ step: 'password' })
    if (email.includes('pending')) return ok({ step: 'verify', challenge: CHALLENGE })
    return ok({ step: 'create-password' })
  },
  async signIn({ password }) {
    await delay()
    return password === DEMO_PASSWORD ? ok({}) : { ok: false, error: 'invalid-credentials' }
  },
  async register() {
    await delay()
    attempts = 0
    return ok({ challenge: CHALLENGE })
  },
  async verifyEmail({ code }) {
    await delay()
    if (code === DEMO_CODE) return ok({ signedIn: true })
    attempts += 1
    return attempts >= 5 ? { ok: false, error: 'too-many-attempts' } : { ok: false, error: 'invalid-code' }
  },
  async resendCode() {
    await delay()
    attempts = 0
    return ok({ resendAfterSeconds: CHALLENGE.resendAfterSeconds })
  },
  async requestPasswordReset() {
    await delay()
    return ok({})
  },
}
