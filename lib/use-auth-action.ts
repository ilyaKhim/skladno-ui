'use client'

import { useCallback, useRef, useState } from 'react'
import { getAuthApi, type AuthApi, type AuthResult } from '@/lib/auth-client'

/**
 * Runs one auth request at a time. A second call while one is in flight is
 * ignored (returns null), which prevents double submission.
 */
export function useAuthAction() {
  const busy = useRef(false)
  const [pending, setPending] = useState(false)

  const run = useCallback(async function run<T>(
    action: (api: AuthApi) => Promise<AuthResult<T>>,
  ): Promise<AuthResult<T> | null> {
    if (busy.current) return null
    busy.current = true
    setPending(true)
    try {
      return await action(await getAuthApi())
    } catch {
      return { ok: false, error: 'network' }
    } finally {
      busy.current = false
      setPending(false)
    }
  }, [])

  return { pending, run }
}
