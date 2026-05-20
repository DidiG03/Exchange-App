import { useEffect, useState } from 'react'
import type { DateFilter, Transaction } from '../../database/types'
import {
  formatAll,
  formatCrossRate,
  formatDateTime,
  formatForeign,
  formatRate
} from '../utils/format'

const FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' }
]

function formatTransactionPair(tx: Transaction): string {
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
  return formatRate(tx.rate_applied)
}

function formatTransactionType(type: Transaction['type']): string {
  if (type === 'cross') return 'Convert'
  return type.charAt(0).toUpperCase() + type.slice(1)
}

export function HistoryPage(): React.JSX.Element {
  const [filter, setFilter] = useState<DateFilter>('all')
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      const data = await window.api.getTransactions(filter)
      setTransactions(data)
      setLoading(false)
    }
    void load()
  }, [filter])

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-slate-600">All logged exchange transactions, newest first.</p>
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

      {loading ? (
        <p className="text-sm text-slate-500">Loading transactions…</p>
      ) : transactions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center text-sm text-slate-500">
          No transactions for this period.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-600">
                  Date / Time
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Currencies</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Amount given</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Amount received</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Rate applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDateTime(tx.created_at)}
                  </td>
                  <td className="px-4 py-3">{formatTransactionType(tx.type)}</td>
                  <td className="px-4 py-3 font-medium">{formatTransactionPair(tx)}</td>
                  <td className="px-4 py-3">{formatAmountGiven(tx)}</td>
                  <td className="px-4 py-3">{formatAmountReceived(tx)}</td>
                  <td className="px-4 py-3">{formatAppliedRate(tx)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
