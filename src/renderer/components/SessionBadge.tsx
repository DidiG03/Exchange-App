import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

function formatRemaining(ms: number): string {
  const totalMinutes = Math.max(0, Math.ceil(ms / 60_000))
  if (totalMinutes >= 60) {
    return '1h'
  }
  return `${totalMinutes}m`
}

export function SessionBadge(): React.JSX.Element | null {
  const { sessionExpiresAt } = useAuth()
  const [remainingMs, setRemainingMs] = useState(0)

  useEffect(() => {
    if (!sessionExpiresAt) return

    const tick = (): void => {
      setRemainingMs(sessionExpiresAt - Date.now())
    }

    tick()
    const interval = setInterval(tick, 30_000)
    return () => clearInterval(interval)
  }, [sessionExpiresAt])

  if (!sessionExpiresAt || remainingMs <= 0) {
    return null
  }

  const urgent = remainingMs < 10 * 60_000

  return (
    <p
      className={`text-xs ${urgent ? 'text-amber-600' : 'text-slate-400'}`}
      title="Session ends automatically after 1 hour"
    >
      Session: {formatRemaining(remainingMs)} left
    </p>
  )
}
