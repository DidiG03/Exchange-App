import { FormEvent, useEffect, useMemo, useState } from 'react'
import { BASE_CURRENCY } from '../../shared/currencies'
import type { CurrencyCode, SupportedCurrency } from '../../shared/currencies'
import { CurrencySelect } from '../components/CurrencySelect'
import { RateChangeHistory } from '../components/RateChangeHistory'
import { useLiveRates } from '../hooks/useLiveRates'
import { derivePairFromAll, pairKey } from '../utils/exchange'
import { formatDateTime, formatPairLabel, formatPairRate } from '../utils/format'

export function RatesPage(): React.JSX.Element {
  const { rates, pairs, ratesByCurrency, pairRatesByKey, loading } = useLiveRates()
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>('EUR')
  const [toCurrency, setToCurrency] = useState<CurrencyCode>(BASE_CURRENCY)
  const [buyRate, setBuyRate] = useState('')
  const [sellRate, setSellRate] = useState('')
  const [isDerived, setIsDerived] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0)

  const involvesAll = fromCurrency === BASE_CURRENCY || toCurrency === BASE_CURRENCY

  useEffect(() => {
    if (fromCurrency === toCurrency) {
      setBuyRate('')
      setSellRate('')
      setIsDerived(false)
      return
    }

    if (involvesAll) {
      const foreignCurrency = (
        fromCurrency === BASE_CURRENCY ? toCurrency : fromCurrency
      ) as SupportedCurrency
      const existing = ratesByCurrency[foreignCurrency]
      if (existing) {
        setBuyRate(String(existing.buy_rate))
        setSellRate(String(existing.sell_rate))
        setIsDerived(false)
      } else {
        setBuyRate('')
        setSellRate('')
        setIsDerived(false)
      }
      return
    }

    const direct = pairRatesByKey[pairKey(fromCurrency, toCurrency)]
    if (direct) {
      setBuyRate(String(direct.buy_rate))
      setSellRate(String(direct.sell_rate))
      setIsDerived(false)
      return
    }

    const fromRate = ratesByCurrency[fromCurrency as SupportedCurrency]
    const toRate = ratesByCurrency[toCurrency as SupportedCurrency]
    if (fromRate && toRate) {
      const derived = derivePairFromAll(
        fromCurrency as SupportedCurrency,
        toCurrency as SupportedCurrency,
        fromRate,
        toRate
      )
      setBuyRate(String(Number(derived.buy_rate.toFixed(6))))
      setSellRate(String(Number(derived.sell_rate.toFixed(6))))
      setIsDerived(true)
      return
    }

    setBuyRate('')
    setSellRate('')
    setIsDerived(false)
  }, [fromCurrency, toCurrency, involvesAll, ratesByCurrency, pairRatesByKey])

  const rateUnitLabel = useMemo(() => {
    if (involvesAll) {
      const foreign = fromCurrency === BASE_CURRENCY ? toCurrency : fromCurrency
      return `${foreign} / ALL`
    }
    return `${toCurrency} per 1 ${fromCurrency}`
  }, [fromCurrency, toCurrency, involvesAll])

  function handleFromChange(next: CurrencyCode): void {
    setFromCurrency(next)
    if (next === toCurrency) {
      setToCurrency(next === BASE_CURRENCY ? 'EUR' : BASE_CURRENCY)
    }
  }

  async function handleSave(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (fromCurrency === toCurrency) {
      setError('From and to currencies must be different.')
      return
    }

    const buy = parseFloat(buyRate)
    const sell = parseFloat(sellRate)

    if (!Number.isFinite(buy) || !Number.isFinite(sell) || buy <= 0 || sell <= 0) {
      setError('Enter valid buy and sell rates greater than zero.')
      return
    }

    setSaving(true)
    const result = await window.api.saveExchangeRate({
      from_currency: fromCurrency,
      to_currency: toCurrency,
      buy_rate: buy,
      sell_rate: sell
    })
    setSaving(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    setSuccess(`Rates for ${formatPairLabel(fromCurrency, toCurrency)} saved. Header updates automatically.`)
    setIsDerived(false)
    setHistoryRefreshKey((key) => key + 1)
    setTimeout(() => setSuccess(null), 3000)
  }

  return (
    <div className="space-y-8">
      <section className="mx-auto max-w-xl">
        <h3 className="mb-4 text-base font-semibold text-slate-800">Update exchange rates</h3>
        <p className="mb-4 text-sm text-slate-600">
          Set rates for any currency pair. When ALL is involved, buy/sell are stored as ALL per 1
          unit of the foreign currency. For pairs like EUR → USD, rates are {rateUnitLabel}.
        </p>

        <form
          onSubmit={handleSave}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="rate-from" className="mb-1.5 block text-sm font-medium text-slate-700">
                From currency
              </label>
              <CurrencySelect
                id="rate-from"
                value={fromCurrency}
                includeAll
                onChange={handleFromChange}
              />
            </div>
            <div>
              <label htmlFor="rate-to" className="mb-1.5 block text-sm font-medium text-slate-700">
                To currency
              </label>
              <CurrencySelect
                id="rate-to"
                value={toCurrency}
                includeAll
                exclude={fromCurrency}
                onChange={setToCurrency}
              />
            </div>
          </div>

          {isDerived && (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Showing calculated {formatPairLabel(fromCurrency, toCurrency)} from ALL rates. Save to
              store a custom pair rate.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="buy-rate" className="mb-1.5 block text-sm font-medium text-slate-700">
                Buy rate ({rateUnitLabel})
              </label>
              <input
                id="buy-rate"
                type="number"
                min="0"
                step="0.000001"
                value={buyRate}
                onChange={(e) => setBuyRate(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
                required
              />
            </div>
            <div>
              <label htmlFor="sell-rate" className="mb-1.5 block text-sm font-medium text-slate-700">
                Sell rate ({rateUnitLabel})
              </label>
              <input
                id="sell-rate"
                type="number"
                min="0"
                step="0.000001"
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
            disabled={saving || fromCurrency === toCurrency}
            className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </form>
      </section>

      <section>
        <h3 className="mb-4 text-base font-semibold text-slate-800">Current rates vs ALL</h3>
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
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Pair</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Buy rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Sell rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map((rate) => (
                  <tr key={rate.currency} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium">{formatPairLabel(rate.currency, BASE_CURRENCY)}</td>
                    <td className="px-4 py-3">{formatPairRate(rate.currency, BASE_CURRENCY, rate.buy_rate)}</td>
                    <td className="px-4 py-3">{formatPairRate(rate.currency, BASE_CURRENCY, rate.sell_rate)}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(rate.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pairs.length > 0 && (
        <section>
          <h3 className="mb-4 text-base font-semibold text-slate-800">Direct currency pairs</h3>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Pair</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Buy rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Sell rate</th>
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Last updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pairs.map((pair) => (
                  <tr key={`${pair.from_currency}-${pair.to_currency}`} className="hover:bg-slate-50/80">
                    <td className="px-4 py-3 font-medium">
                      {formatPairLabel(pair.from_currency, pair.to_currency)}
                    </td>
                    <td className="px-4 py-3">
                      {formatPairRate(pair.from_currency, pair.to_currency, pair.buy_rate)}
                    </td>
                    <td className="px-4 py-3">
                      {formatPairRate(pair.from_currency, pair.to_currency, pair.sell_rate)}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{formatDateTime(pair.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <RateChangeHistory refreshKey={historyRefreshKey} />
    </div>
  )
}
