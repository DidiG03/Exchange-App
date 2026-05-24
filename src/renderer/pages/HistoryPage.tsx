import { useEffect, useMemo, useState } from 'react'
import type { DateFilter, GetTransactionsFilter, Transaction } from '../../database/types'
import { VoidTransactionDialog } from '../components/VoidTransactionDialog'
import {
  formatAll,
  formatCrossRate,
  formatDateTime,
  formatForeign,
} from '../utils/format'

type HistoryPeriod = DateFilter | 'custom'

const PRESET_FILTERS: { value: HistoryPeriod; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' }
]

function toDateInputValue(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatRangeLabel(from: string, to: string): string {
  const fmt = (iso: string) => {
    const [, month, day] = iso.split('-')
    const year = iso.slice(0, 4)
    return `${day}/${month}/${year}`
  }
  return `${fmt(from)} – ${fmt(to)}`
}

function buildQueryFilter(
  period: HistoryPeriod,
  customFrom: string,
  customTo: string
): DateFilter | GetTransactionsFilter {
  if (period === 'custom') {
    return { from: customFrom, to: customTo }
  }
  return { preset: period }
}

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

type SortColumn =
  | 'date'
  | 'status'
  | 'operator'
  | 'currencies'
  | 'amountGiven'
  | 'amountReceived'
  | 'rate'

type SortDirection = 'asc' | 'desc'

function compareTransactions(
  a: Transaction,
  b: Transaction,
  column: SortColumn,
  direction: SortDirection
): number {
  let cmp = 0

  switch (column) {
    case 'date':
      cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      break
    case 'status':
      cmp = Number(isVoided(a)) - Number(isVoided(b))
      break
    case 'operator':
      cmp = (a.created_by_username ?? '').localeCompare(b.created_by_username ?? '', 'sq')
      break
    case 'currencies':
      cmp = formatTransactionPair(a).localeCompare(formatTransactionPair(b), 'sq')
      break
    case 'amountGiven':
      cmp = a.amount_given - b.amount_given
      break
    case 'amountReceived':
      cmp = a.amount_received - b.amount_received
      break
    case 'rate':
      cmp = a.rate_applied - b.rate_applied
      break
  }

  return direction === 'asc' ? cmp : -cmp
}

function SortableHeader({
  label,
  column,
  activeColumn,
  activeDirection,
  onSort,
  className = ''
}: {
  label: string
  column: SortColumn
  activeColumn: SortColumn
  activeDirection: SortDirection
  onSort: (column: SortColumn, direction: SortDirection) => void
  className?: string
}): React.JSX.Element {
  const isActive = activeColumn === column

  return (
    <th
      className={`px-4 py-3 text-left font-medium text-slate-600 ${className}`.trim()}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span className="inline-flex flex-col -space-y-0.5">
          <button
            type="button"
            onClick={() => onSort(column, 'asc')}
            aria-label={`Sort ${label} lowest to highest`}
            className={`rounded px-0.5 text-[10px] leading-none transition-colors ${
              isActive && activeDirection === 'asc'
                ? 'bg-navy-900 text-white'
                : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
            }`}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onSort(column, 'desc')}
            aria-label={`Sort ${label} highest to lowest`}
            className={`rounded px-0.5 text-[10px] leading-none transition-colors ${
              isActive && activeDirection === 'desc'
                ? 'bg-navy-900 text-white'
                : 'text-slate-400 hover:bg-slate-200 hover:text-slate-700'
            }`}
          >
            ▼
          </button>
        </span>
      </div>
    </th>
  )
}

export function HistoryPage(): React.JSX.Element {
  const [period, setPeriod] = useState<HistoryPeriod>('all')
  const [customFrom, setCustomFrom] = useState(() => toDateInputValue(daysAgo(6)))
  const [customTo, setCustomTo] = useState(() => toDateInputValue(new Date()))
  const [hideVoided, setHideVoided] = useState(false)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [voidTarget, setVoidTarget] = useState<Transaction | null>(null)
  const [voidSuccess, setVoidSuccess] = useState<string | null>(null)
  const [sortColumn, setSortColumn] = useState<SortColumn>('date')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')

  const queryFilter = useMemo(
    () => buildQueryFilter(period, customFrom, customTo),
    [period, customFrom, customTo]
  )

  const periodLabel = useMemo(() => {
    if (period === 'custom') return formatRangeLabel(customFrom, customTo)
    if (period === 'today') return 'today'
    if (period === 'week') return 'the last 7 days'
    return 'all time'
  }, [period, customFrom, customTo])

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      const data = await window.api.getTransactions(queryFilter)
      setTransactions(Array.isArray(data) ? data : [])
      setLoading(false)
    }
    void load()
  }, [queryFilter])

  const visibleTransactions = useMemo(
    () => (hideVoided ? transactions.filter((tx) => !isVoided(tx)) : transactions),
    [transactions, hideVoided]
  )

  const sortedTransactions = useMemo(() => {
    const list = [...visibleTransactions]
    list.sort((a, b) => compareTransactions(a, b, sortColumn, sortDirection))
    return list
  }, [visibleTransactions, sortColumn, sortDirection])

  function handleSort(column: SortColumn, direction: SortDirection): void {
    setSortColumn(column)
    setSortDirection(direction)
  }

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
            All logged exchange transactions. Use column arrows to sort. Voided rows stay in the
            database for inspection.
          </p>
          {!loading && (
            <p className="mt-1 text-xs text-slate-500">
              {transactions.length} in {periodLabel}
              {voidedCount > 0 ? ` · ${voidedCount} voided` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex flex-wrap items-center justify-end gap-3">
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
              {PRESET_FILTERS.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setPeriod(item.value)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    period === item.value
                      ? 'bg-navy-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          {period === 'custom' && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <span className="font-medium">From</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
                />
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-600">
                <span className="font-medium">To</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
                />
              </label>
            </div>
          )}
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
                <SortableHeader
                  label="Date / Time"
                  column="date"
                  activeColumn={sortColumn}
                  activeDirection={sortDirection}
                  onSort={handleSort}
                  className="whitespace-nowrap"
                />
                <SortableHeader
                  label="Status"
                  column="status"
                  activeColumn={sortColumn}
                  activeDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Operator"
                  column="operator"
                  activeColumn={sortColumn}
                  activeDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-left font-medium text-slate-600">Type</th>
                <SortableHeader
                  label="Currencies"
                  column="currencies"
                  activeColumn={sortColumn}
                  activeDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Amount given"
                  column="amountGiven"
                  activeColumn={sortColumn}
                  activeDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Amount received"
                  column="amountReceived"
                  activeColumn={sortColumn}
                  activeDirection={sortDirection}
                  onSort={handleSort}
                />
                <SortableHeader
                  label="Rate applied"
                  column="rate"
                  activeColumn={sortColumn}
                  activeDirection={sortDirection}
                  onSort={handleSort}
                />
                <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedTransactions.map((tx) => {
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
