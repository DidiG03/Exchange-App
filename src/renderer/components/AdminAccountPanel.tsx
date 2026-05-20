import { FormEvent, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'

export function AdminAccountPanel(): React.JSX.Element | null {
  const { user, isAdmin, setCurrentUser } = useAuth()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newUsername, setNewUsername] = useState(user?.username ?? '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (user) {
      setNewUsername(user.username)
    }
  }, [user?.username])

  if (!isAdmin || !user) {
    return null
  }

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const trimmedUsername = newUsername.trim()
    const hasUsername = trimmedUsername.length > 0 && trimmedUsername !== user!.username
    const hasPassword = newPassword.length > 0

    if (!hasUsername && !hasPassword) {
      setError('Enter a new username and/or new password.')
      return
    }

    if (hasPassword && newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    setSubmitting(true)
    const result = await window.api.updateAdminCredentials({
      current_password: currentPassword,
      ...(hasUsername ? { new_username: trimmedUsername } : {}),
      ...(hasPassword ? { new_password: newPassword } : {})
    })
    setSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    setCurrentUser(result.data)
    setCurrentPassword('')
    setNewUsername(result.data.username)
    setNewPassword('')
    setConfirmPassword('')

    const parts: string[] = []
    if (hasUsername) parts.push('username')
    if (hasPassword) parts.push('password')
    setSuccess(`Administrator ${parts.join(' and ')} updated successfully.`)
    setTimeout(() => setSuccess(null), 4000)
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-800">Administrator account</h3>
      <p className="mt-2 text-sm text-slate-600">
        Change the sign-in username and/or password for the admin account (
        <span className="font-medium">{user.username}</span>). Your current password is required.
      </p>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 max-w-md space-y-4">
        <div>
          <label
            htmlFor="admin-current-password"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            Current password
          </label>
          <input
            id="admin-current-password"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            required
          />
        </div>

        <div>
          <label
            htmlFor="admin-new-username"
            className="mb-1.5 block text-sm font-medium text-slate-700"
          >
            New username
          </label>
          <input
            id="admin-new-username"
            type="text"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            placeholder={user.username}
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_]+"
            title="Letters, numbers, and underscores only"
          />
          <p className="mt-1 text-xs text-slate-500">Leave unchanged to keep {user.username}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="admin-new-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              New password
            </label>
            <input
              id="admin-new-password"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
              minLength={6}
            />
          </div>
          <div>
            <label
              htmlFor="admin-confirm-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Confirm new password
            </label>
            <input
              id="admin-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
              minLength={6}
            />
          </div>
        </div>
        <p className="text-xs text-slate-500">Leave password fields empty to keep the current password.</p>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {success && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {success}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {submitting ? 'Saving…' : 'Update administrator'}
        </button>
      </form>
    </section>
  )
}
