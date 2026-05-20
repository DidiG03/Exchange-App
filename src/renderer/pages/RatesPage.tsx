import { FormEvent, useEffect, useState } from 'react'
import type { SupportedCurrency } from '../../database/types'
import { useLiveRates } from '../hooks/useLiveRates'
import { formatDateTime, formatRate } from '../utils/format'

const CURRENCIES: SupportedCurrency[] = ['EUR', 'GBP', 'USD']

export function RatesPage(): React.JSX.Element {
  const { rates, loading } = useLiveRates()
  const [currency, setCurrency] = useState<SupportedCurrency>('EUR')
  const [buyRate, setBuyRate] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    const existing = rates.find((r) => r.currency === currency)
    if (existing) {
      setBuyRate(String(existing.buy_rate))
      setSellRate(String(existing.sell_rate))
    } else {
      setBuyRate('')
      setSellRate('')
    }
  }, [currency, rates])

  async function handleSave(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const buy = parseFloat(buyRate)
    const sell = parseFloat(sellRate)

    if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) {
      setError('Enter valid buy and sell rates greater than zero.')
      return
    }

    setSaving(true)
    const result = await window.api.saveRate({
      currency,
      buy_rate: buy,
      sell_rate: sell
    })
    setSaving(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    setSuccess(`Rates for ${currency} saved. Header updates automatically.`)
    setTimeout(() => setSuccess(null), 3000)
  }

  return (
    <div className="space-y-8">
      <section className="mx-auto max-w-xl">
        <h3 className="mb-4 text-base font-semibold text-slate-800">Update exchange rates</h3>
        <p className="mb-4 text-sm text-slate-600">
          Rates are ALL per 1 unit of foreign currency. Buy rate applies when the bureau buys
          foreign currency from the customer; sell rate when selling foreign currency to the
          customer.
        </p>

        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div>
            <label htmlFor="rate-currency" className="mb-1.5 block text-sm font-medium text-slate-700">
              Currency
            </label>
            <select
              id="rate-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value as SupportedCurrency)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            >
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code} / ALL
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="buy-rate" className="mb-1.5 block text-sm font-medium text-slate-700">
                Buy rate (ALL per 1 {currency})
              </label>
              <input
                id="buy-rate"
                type="number"
                min="0"
                step="0.01"
                value={buyRate}
                onChange={(e) => setBuyRate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
                required
              />
            </div>
            <div>
              <label htmlFor="sell-rate" className="mb-1.5 block text-sm font-medium text-slate-700">
                Sell rate (ALL per 1 {currency})
              </label>
              <input
                id="sell-rate"
                type="number"
                min="0"
                step="0.01"
                value={sellRate}
                onChange={(e) => setSellRate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
                required
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
            disabled={saving}
            className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section>
        <h3 className="mb-4 text-base font-semibold text-slate-800">Current rates</h3>
        {loading ? (
          <p className="text-sm text-slate-500">Loading…</p>
        ) : rates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
            No rates saved yet.
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Currency</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Buy rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Sell rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map((rate) => (
                  <tr key={rate.currency} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium">{rate.currency}</td>
                    <td className="px-4 py-3">{formatRate(rate.buy_rate)}</td>
                    <td className="px-4 py-3">{formatRate(rate.sell_rate)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(rate.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
