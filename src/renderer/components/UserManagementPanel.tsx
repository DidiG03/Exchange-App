import { FormEvent, useCallback, useEffect, useState } from 'react'
import type { UserListEntry } from '../../database/types'
import { useAuth } from '../context/AuthContext'
import { formatDateTime } from '../utils/format'

export function UserManagementPanel(): React.JSX.Element | null {
  const { user, isAdmin } = useAuth()
  const [users, setUsers] = useState<UserListEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const loadUsers = useCallback(async () => {
    setLoading(true)
    const result = await window.api.listUsers()
    if (result.success) {
      setUsers(result.data)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    if (isAdmin) {
      void loadUsers()
    }
  }, [isAdmin, loadUsers])

  if (!isAdmin) {
    return null
  }

  async function handleCreate(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    const result = await window.api.createUser({ username, password })
    setSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    setSuccess(`User "${result.data.username}" created. They can sign in immediately.`)
    setUsername('')
    setPassword('')
    setConfirmPassword('')
    void loadUsers()
    setTimeout(() => setSuccess(null), 4000)
  }

  async function handleDelete(entry: UserListEntry): Promise<void> {
    if (entry.role === 'admin') return

    const confirmed = window.confirm(
      `Delete staff user "${entry.username}"? They will no longer be able to sign in. Past transactions and logs will still show their name.`
    )
    if (!confirmed) return

    setError(null)
    setSuccess(null)
    setDeletingId(entry.id)

    const result = await window.api.deleteUser(entry.id)
    setDeletingId(null)

    if (!result.success) {
      setError(result.error)
      return
    }

    setSuccess(`User "${entry.username}" deleted.`)
    void loadUsers()
    setTimeout(() => setSuccess(null), 4000)
  }

  function canDelete(entry: UserListEntry): boolean {
    return entry.role === 'staff' && entry.id !== user?.id
  }

  return (
    <section className="settings-section rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-base font-semibold text-slate-800">Staff accounts</h3>
      <p className="mt-2 text-sm text-slate-600">
        Register cashiers and other staff. Each user signs in with their own username; transactions,
        rate changes, and voids are logged under their name.
      </p>
      <p className="mt-1 text-xs text-slate-500">
        Signed in as <span className="font-medium">{user?.username}</span> (admin). Usernames are
        stored lowercase (letters, numbers, underscores).
      </p>

      <form onSubmit={(e) => void handleCreate(e)} className="mt-6 max-w-md space-y-4">
        <div>
          <label htmlFor="new-username" className="mb-1.5 block text-sm font-medium text-slate-700">
            Username
          </label>
          <input
            id="new-username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="off"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_]+"
            title="Letters, numbers, and underscores only"
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="new-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
              required
              minLength={6}
            />
          </div>
          <div>
            <label
              htmlFor="confirm-password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Confirm password
            </label>
            <input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
              required
              minLength={6}
            />
          </div>
        </div>

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
          {submitting ? 'Creating…' : 'Create user'}
        </button>
      </form>

      <div className="mt-8">
        <h4 className="text-sm font-semibold text-slate-800">Registered users</h4>
        {loading ? (
          <p className="mt-2 text-sm text-slate-500">Loading…</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {users.map((entry) => (
              <li
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <span className="font-medium text-slate-900">{entry.username}</span>
                  <span
                    className={`ml-2 inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                      entry.role === 'admin'
                        ? 'bg-navy-100 text-navy-800'
                        : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {entry.role === 'admin' ? 'Admin' : 'Staff'}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-slate-500">
                    Added {formatDateTime(entry.created_at)}
                  </span>
                  {canDelete(entry) ? (
                    <button
                      type="button"
                      onClick={() => void handleDelete(entry)}
                      disabled={deletingId === entry.id}
                      className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      {deletingId === entry.id ? 'Deleting…' : 'Delete'}
                    </button>
                  ) : entry.role === 'admin' ? (
                    <span className="text-xs text-slate-400">Protected</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
