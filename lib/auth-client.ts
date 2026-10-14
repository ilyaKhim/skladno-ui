import type { AuthMode } from '@/lib/auth-links'

export interface SignupPayload {
  mode: 'signup'
  name: string
  email: string
  password: string
  returnTo: string | null
}

export interface LoginPayload {
  mode: 'login'
  email: string
  password: string
  returnTo: string | null
}

export type AuthPayload = SignupPayload | LoginPayload

export type AuthResult = { status: 'backend-unavailable' }

export const BACKEND_UNAVAILABLE_MESSAGE = 'Интерфейс готов. Авторизация заработает после подключения backend'

/**
 * Single seam for authentication. It is a prototype stub: nothing is sent
 * anywhere and no account or session is created. When the backend is ready,
 * replace the body with a real API call and extend `AuthResult` with the
 * success and error outcomes the form should react to.
 */
export async function submitAuth(payload: AuthPayload): Promise<AuthResult> {
  void payload
  return { status: 'backend-unavailable' }
}

export type { AuthMode }
