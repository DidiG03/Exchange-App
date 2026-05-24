import { useEffect, useMemo, useState } from 'react'
import type { DateFilter, Transaction } from '../../database/types'
import { VoidTransactionDialog } from '../components/VoidTransactionDialog'
import {
  formatAll,
  formatCrossRate,
  formatDateTime,
  formatForeign,
} from '../utils/format'

const FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' }
]

function formatTransactionPair(tx: Transaction): string {
  if (tx.type === 'buy') return `${tx.currency} → ALL`
  if (tx.type === 'sell') return `ALL → ${tx.currency}`
  if (tx.type === 'cross' && tx.to_currency) {
    return `${tx.currency} → ${tx.to_currency}`
  }
  return tx.currency
}

function formatAmountGiven(tx: Transaction): string {
  if (tx.type === 'sell') return formatAll(tx.amount_given)
  return formatForeign(tx.amount_given, tx.currency)
}

function formatAmountReceived(tx: Transaction): string {
  if (tx.type === 'buy') return formatAll(tx.amount_received)
  if (tx.type === 'cross' && tx.to_currency) {
    return formatForeign(tx.amount_received, tx.to_currency)
  }
  return formatForeign(tx.amount_received, tx.currency)
}

function formatAppliedRate(tx: Transaction): string {
  if (tx.type === 'cross' && tx.to_currency) {
    return formatCrossRate(tx.currency, tx.to_currency, tx.rate_applied)
  }
  if (tx.type === 'buy') {
    return formatCrossRate(tx.currency, 'ALL', tx.rate_applied)
  }
  return formatCrossRate('ALL', tx.currency, tx.rate_applied)
}

function formatTransactionType(type: Transaction['type']): string {
  return 'Exchange'
}

function isVoided(tx: Transaction): boolean {
  return tx.voided_at != null
}

export function HistoryPage(): React.JSX.Element {
  const [filter, setFilter] = useState<DateFilter>('all')
  const [hideVoided, setHideVoided] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null)
  const [voidSuccess, setVoidSuccess] = useState<string | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      const data = await window.api.getTransactions(filter)
      setTransactions(Array.isArray(data) ? data : [])
      setLoading(false)
    }
    void load()
  }, [filter])

  const visibleTransactions = useMemo(
    () => (hideVoided ? transactions.filter((tx) => !isVoided(tx)) : transactions),
    [transactions, hideVoided]
  )

  const voidedCount = useMemo(
    () => transactions.filter((tx) => isVoided(tx)).length,
    [transactions]
  )

  function handleVoided(updated: Transaction): void {
    setTransactions((prev) => prev.map((tx) => (tx.id === updated.id ? updated : tx)))
    setVoidSuccess(`Transaction #${updated.id} voided. Record kept for audit.`)
    setTimeout(() => setVoidSuccess(null), 4000)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-600">
            All logged exchange transactions, newest first. Voided rows stay in the database for
            inspection.
          </p>
          {!loading && transactions.length > 0 && (
            <p className="mt-1 text-xs text-slate-500">
              {transactions.length} in this period
              {voidedCount > 0 ? ` · ${voidedCount} voided` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={hideVoided}
              onChange={(e) => setHideVoided(e.target.checked)}
              className="rounded border-slate-300 text-navy-900 focus:ring-navy-700"
            />
            Hide voided
          </label>
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === item.value
                    ? 'bg-navy-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {voidSuccess && (
        <p className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
          {voidSuccess}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-slate-500">Loading transactions…</p>
      ) : visibleTransactions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
          {hideVoided && voidedCount > 0
            ? 'No active transactions for this period (voided entries are hidden).'
            : 'No transactions for this period.'}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-600">
                  Date / Time
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Status</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Operator</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Currencies</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Amount given</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Amount received</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Rate applied</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visibleTransactions.map((tx) => {
                const voided = isVoided(tx)
                return (
                  <tr
                    key={tx.id}
                    className={voided ? 'bg-red-50/40 text-slate-500' : 'hover:bg-slate-50/80'}
                  >
                    <td className="whitespace-nowrap px-4 py-3">
                      {formatDateTime(tx.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {voided ? (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">
                          Voided
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {tx.created_by_username ?? '—'}
                    </td>
                    <td className={`px-4 py-3 ${voided ? 'line-through' : ''}`}>
                      {formatTransactionType(tx.type)}
                    </td>
                    <td className={`px-4 py-3 font-medium ${voided ? 'line-through' : ''}`}>
                      {formatTransactionPair(tx)}
                    </td>
                    <td className={`px-4 py-3 ${voided ? 'line-through' : ''}`}>
                      {formatAmountGiven(tx)}
                    </td>
                    <td className={`px-4 py-3 ${voided ? 'line-through' : ''}`}>
                      {formatAmountReceived(tx)}
                    </td>
                    <td className={`px-4 py-3 ${voided ? 'line-through' : ''}`}>
                      {formatAppliedRate(tx)}
                    </td>
                    <td className="px-4 py-3">
                      {voided ? (
                        <div className="max-w-xs text-xs text-slate-600">
                          <p className="font-medium text-red-800">{tx.void_reason}</p>
                          <p className="mt-0.5">
                            {tx.voided_by_username} · {formatDateTime(tx.voided_at!)}
                          </p>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setVoidTarget(tx)}
                          className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50"
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <VoidTransactionDialog
        transaction={voidTarget}
        onClose={() => setVoidTarget(null)}
        onVoided={handleVoided}
      />
    </div>
  )
}
