import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithRedirect,
  signOut as firebaseSignOut,
  getRedirectResult,
  type User,
} from 'firebase/auth'
import { firebaseAuth, firebaseConfigured } from './firebase'
import { AuthContext } from './auth-context'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(Boolean(firebaseAuth))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!firebaseAuth) {
      setLoading(false)
      return
    }

    const unsubscribe = onAuthStateChanged(firebaseAuth, setUser, () => {
      setError('Unable to check Google sign-in state.')
      setLoading(false)
    })
    getRedirectResult(firebaseAuth)
      .then((result) => {
        if (result?.user) setUser(result.user)
      })
      .catch(() => setError('Google sign-in could not be completed. Please try again.'))
      .finally(() => setLoading(false))

    return unsubscribe
  }, [])

  const signIn = useCallback(async () => {
    if (!firebaseAuth) throw new Error('Google sign-in has not been configured.')
    setError('')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      await signInWithRedirect(firebaseAuth, provider)
    } catch {
      setError('Unable to start Google sign-in.')
    }
  }, [])

  const signOut = useCallback(async () => {
    if (!firebaseAuth) return
    try {
      await firebaseSignOut(firebaseAuth)
      setUser(null)
    } catch {
      setError('Unable to sign out.')
    }
  }, [])

  const value = useMemo(
    () => ({ user, loading, error, configured: firebaseConfigured, signIn, signOut }),
    [user, loading, error, signIn, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
