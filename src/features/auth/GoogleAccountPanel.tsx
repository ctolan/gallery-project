import { Alert, Button, CircularProgress, Stack, Typography } from '@mui/material'
import { useAuth } from './auth-context'

export function GoogleAccountPanel() {
  const { user, loading, error, configured, signIn, signOut } = useAuth()

  if (loading) return <CircularProgress size={24} aria-label="Checking sign-in" />

  return (
    <Stack spacing={1}>
      {!configured && (
        <Alert severity="warning">
          Google sign-in is not configured in this build yet.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}
      {user ? (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2">{user.email}</Typography>
          <Button size="small" onClick={() => void signOut()}>
            Sign out
          </Button>
        </Stack>
      ) : (
        <Button variant="outlined" onClick={() => void signIn()} disabled={!configured}>
          Continue with Google
        </Button>
      )}
    </Stack>
  )
}
