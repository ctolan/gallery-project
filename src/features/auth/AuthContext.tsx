import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
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

    const unsubscribe = onAuthStateChanged(
      firebaseAuth,
      (nextUser) => {
        setUser(nextUser)
        setLoading(false)
      },
      () => {
        setError('Unable to check Google sign-in state.')
        setLoading(false)
      },
    )

    return unsubscribe
  }, [])

  const signIn = useCallback(async () => {
    if (!firebaseAuth) throw new Error('Google sign-in has not been configured.')
    setError('')
    const provider = new GoogleAuthProvider()
    provider.setCustomParameters({ prompt: 'select_account' })
    try {
      // A popup keeps sign-in on a single page load, avoiding the
      // full-page redirect's storage-bounce through the custom authDomain
      // (which mobile browsers with partitioned/blocked third-party
      // storage can fail to persist, causing an endless sign-in loop).
      const result = await signInWithPopup(firebaseAuth, provider)
      setUser(result.user)
    } catch {
      setError('Unable to complete Google sign-in. Please allow pop-ups and try again.')
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
