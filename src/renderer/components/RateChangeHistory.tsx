import { useCallback, useEffect, useState } from 'react'
import type { DateFilter, GetRateHistoryOptions, RateChangeLogEntry, SupportedCurrency } from '../../database/types'
import { CURRENCY_CODES } from '../../shared/currencies'
import { formatDateTime, formatPairLabel, formatPairRate } from '../utils/format'

const PERIOD_FILTERS: { value: DateFilter; label: string }[] = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'all', label: 'All time' }
]

function formatPair(entry: RateChangeLogEntry): string {
  if (entry.from_currency && entry.to_currency) {
    return formatPairLabel(entry.from_currency, entry.to_currency)
  }
  return entry.currency
}

function formatPrevious(entry: RateChangeLogEntry, value: number | null): string {
  if (value === null) return '—'
  const from = entry.from_currency ?? entry.currency
  const to = entry.to_currency ?? 'ALL'
  return formatPairRate(from, to, value)
}

function formatDelta(entry: RateChangeLogEntry, previous: number | null, next: number): string {
  if (previous === null) return formatPrevious(entry, next)
  if (Math.abs(previous - next) < 1e-9) return formatPrevious(entry, next)
  return `${formatPrevious(entry, previous)} → ${formatPrevious(entry, next)}`
}

interface RateChangeHistoryProps {
  refreshKey?: number
}

export function RateChangeHistory({ refreshKey = 0 }: RateChangeHistoryProps): React.JSX.Element {
  const [period, setPeriod] = useState<DateFilter>('week')
  const [currencyFilter, setCurrencyFilter] = useState<SupportedCurrency | ''>('')
  const [entries, setEntries] = useState<RateChangeLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const options: GetRateHistoryOptions = {
      filter: period,
      limit: 200
    }
    if (currencyFilter) {
      options.currency = currencyFilter
    }
    const data = await window.api.getRateChangeHistory(options)
    setEntries(Array.isArray(data) ? data : [])
    setLoading(false)
  }, [period, currencyFilter])

  useEffect(() => {
    void load()
  }, [load, refreshKey])

  return (
    <section>
      <h3 className="mb-2 text-base font-semibold text-slate-800">Rate change history</h3>
      <p className="mb-4 text-sm text-slate-600">
        Every save on this screen is logged with operator, time, and previous vs new buy/sell rates.
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
          {PERIOD_FILTERS.map((item) => (
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

        <select
          value={currencyFilter}
          onChange={(e) => setCurrencyFilter(e.target.value as SupportedCurrency | '')}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
          aria-label="Filter by currency"
        >
          <option value="">All currencies</option>
          {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading history…</p>
      ) : entries.length === 0 ? (
        <p className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
          No rate changes logged for this period.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="whitespace-nowrap px-4 py-3 text-left font-medium text-slate-600">
                  When
                </th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Operator</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Pair</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Buy rate</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Sell rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {entries.map((entry) => (
                <tr key={entry.id} className="hover:bg-slate-50/80">
                  <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                    {formatDateTime(entry.changed_at)}
                  </td>
                  <td className="px-4 py-3 font-medium">{entry.changed_by_username}</td>
                  <td className="px-4 py-3 font-medium">{formatPair(entry)}</td>
                  <td className="px-4 py-3">
                    <span title={`Was ${formatPrevious(entry, entry.previous_buy_rate)}`}>
                      {formatDelta(entry, entry.previous_buy_rate, entry.new_buy_rate)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span title={`Was ${formatPrevious(entry, entry.previous_sell_rate)}`}>
                      {formatDelta(entry, entry.previous_sell_rate, entry.new_sell_rate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
