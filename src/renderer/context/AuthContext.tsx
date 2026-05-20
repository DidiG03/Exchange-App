import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type { User } from '../../database/types'

interface AuthContextValue {
  user: User | null
  isAdmin: boolean
  isAuthenticated: boolean
  isRestoring: boolean
  sessionExpiresAt: number | null
  sessionExpiredMessage: string | null
  login: (username: string, password: string) => Promise<string | null>
  logout: () => Promise<void>
  setCurrentUser: (user: User) => void
  clearSessionExpiredMessage: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [user, setUser] = useState<User | null>(null)
  const [isRestoring, setIsRestoring] = useState(true)
  const [sessionExpiresAt, setSessionExpiresAt] = useState<number | null>(null)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null)
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clearLogoutTimer = useCallback(() => {
    if (logoutTimerRef.current) {
      clearTimeout(logoutTimerRef.current)
      logoutTimerRef.current = null
    }
  }, [])

  const handleSessionEnd = useCallback(
    (message?: string) => {
      clearLogoutTimer()
      setUser(null)
      setSessionExpiresAt(null)
      void window.api.logout()
      if (message) {
        setSessionExpiredMessage(message)
      }
    },
    [clearLogoutTimer]
  )

  const scheduleLogout = useCallback(
    (expiresAt: number) => {
      clearLogoutTimer()
      setSessionExpiresAt(expiresAt)
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) {
        handleSessionEnd('Your session has expired. Please sign in again.')
        return
      }
      logoutTimerRef.current = setTimeout(() => {
        handleSessionEnd('Your session has expired after 1 hour. Please sign in again.')
      }, remaining)
    },
    [clearLogoutTimer, handleSessionEnd]
  )

  const logout = useCallback(async () => {
    clearLogoutTimer()
    setUser(null)
    setSessionExpiresAt(null)
    setSessionExpiredMessage(null)
    await window.api.logout()
  }, [clearLogoutTimer])

  const login = useCallback(
    async (username: string, password: string) => {
      setSessionExpiredMessage(null)
      const result = await window.api.login(username.trim(), password)
      if (!result.success || !result.user || !result.expiresAt) {
        return result.error ?? 'Login failed'
      }
      setUser(result.user)
      scheduleLogout(result.expiresAt)
      return null
    },
    [scheduleLogout]
  )

  const clearSessionExpiredMessage = useCallback(() => {
    setSessionExpiredMessage(null)
  }, [])

  const setCurrentUser = useCallback((nextUser: User) => {
    setUser(nextUser)
  }, [])

  useEffect(() => {
    async function restore(): Promise<void> {
      if (!window.api?.restoreSession) {
        setIsRestoring(false)
        return
      }
      try {
        const status = await window.api.restoreSession()
        if (status.valid && status.user && status.expiresAt) {
          setUser(status.user)
          scheduleLogout(status.expiresAt)
        }
      } catch (error) {
        console.error('Session restore failed:', error)
      } finally {
        setIsRestoring(false)
      }
    }
    void restore()
  }, [scheduleLogout])

  useEffect(() => {
    return window.api.onSessionExpired(() => {
      handleSessionEnd('Your session has expired. Please sign in again.')
    })
  }, [handleSessionEnd])

  useEffect(() => () => clearLogoutTimer(), [clearLogoutTimer])

  const value = useMemo(
    () => ({
      user,
      isAdmin: user?.role === 'admin',
      isAuthenticated: user !== null,
      isRestoring,
      sessionExpiresAt,
      sessionExpiredMessage,
      login,
      logout,
      setCurrentUser,
      clearSessionExpiredMessage
    }),
    [
      user,
      isRestoring,
      sessionExpiresAt,
      sessionExpiredMessage,
      login,
      logout,
      setCurrentUser,
      clearSessionExpiredMessage
    ]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider')
  }
  return context
}
