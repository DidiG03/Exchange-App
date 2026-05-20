import { FormEvent, useEffect, useState } from 'react'
import type { Transaction } from '../../database/types'
import { formatDateTime } from '../utils/format'

interface VoidTransactionDialogProps {
  transaction: Transaction | null
  onClose: () => void
  onVoided: (updated: Transaction) => void
}

export function VoidTransactionDialog({
  transaction,
  onClose,
  onVoided
}: VoidTransactionDialogProps): React.JSX.Element | null {
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (transaction) {
      setReason('')
      setError(null)
      setSubmitting(false)
    }
  }, [transaction])

  if (!transaction) return null

  async function handleSubmit(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSubmitting(true)

    const result = await window.api.voidTransaction(transaction!.id, reason)
    setSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    onVoided(result.data)
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="void-dialog-title"
    >
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl"
      >
        <h3 id="void-dialog-title" className="text-lg font-semibold text-slate-900">
          Void transaction #{transaction.id}
        </h3>
        <p className="mt-2 text-sm text-slate-600">
          The original record stays in the database for audit. Enter why this transaction is being
          voided (wrong amount, customer cancelled, duplicate entry, etc.).
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Logged {formatDateTime(transaction.created_at)} · {transaction.type} · {transaction.currency}
          {transaction.to_currency ? ` → ${transaction.to_currency}` : ''}
        </p>

        <label htmlFor="void-reason" className="mt-4 block text-sm font-medium text-slate-700">
          Reason (required)
        </label>
        <textarea
          id="void-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          maxLength={500}
          required
          placeholder="e.g. Wrong rate applied, customer cancelled before completion"
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
        />
        <p className="mt-1 text-xs text-slate-400">{reason.trim().length}/500 (min. 3 characters)</p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || reason.trim().length < 3}
            className="rounded-lg bg-red-700 px-4 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          >
            {submitting ? 'Voiding…' : 'Void transaction'}
          </button>
        </div>
      </form>
    </div>
  )
}
