import { FormEvent, useMemo, useState } from 'react'
import { CURRENCY_CODES } from '../../shared/currencies'
import type { SupportedCurrency, TransactionType } from '../../database/types'
import { CurrencySelect } from '../components/CurrencySelect'
import { useLiveRates } from '../hooks/useLiveRates'
import { calculateConversion, calculateCrossConversion } from '../utils/exchange'
import { formatAll, formatCrossRate, formatForeign, formatRate } from '../utils/format'

const TRANSACTION_TYPES: { value: TransactionType; label: string }[] = [
  { value: 'buy', label: 'Buy' },
  { value: 'sell', label: 'Sell' },
  { value: 'cross', label: 'Convert' }
]

export function ExchangePage(): React.JSX.Element {
  const [type, setType] = useState<TransactionType>('buy')
  const [currency, setCurrency] = useState<SupportedCurrency>('EUR')
  const [toCurrency, setToCurrency] = useState<SupportedCurrency>('USD')
  const [amount, setAmount] = useState('')
  const { ratesByCurrency, loading: loadingRates } = useLiveRates()
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const amountGiven = parseFloat(amount) || 0
  const currentRate = ratesByCurrency[currency] ?? null
  const toRate = ratesByCurrency[toCurrency] ?? null

  const conversion = useMemo(() => {
    if (type === 'cross') {
      return calculateCrossConversion(currency, toCurrency, amountGiven, currentRate, toRate)
    }
    return calculateConversion(type, currency, amountGiven, currentRate)
  }, [type, currency, toCurrency, amountGiven, currentRate, toRate])

  const missingRates = useMemo(() => {
    if (type === 'cross') {
      const missing: SupportedCurrency[] = []
      if (!currentRate) missing.push(currency)
      if (!toRate) missing.push(toCurrency)
      return missing
    }
    return !currentRate ? [currency] : []
  }, [type, currency, toCurrency, currentRate, toRate])

  const resultText = useMemo(() => {
    if (!conversion || amountGiven <= 0) return null
    if (conversion.receivedIsAll) {
      return `Customer receives: ${formatAll(conversion.amountReceived)}`
    }
    if (type === 'cross' && conversion.toCurrency) {
      return `Customer receives: ${formatForeign(conversion.amountReceived, conversion.toCurrency)}`
    }
    return `Customer receives: ${formatForeign(conversion.amountReceived, currency)}`
  }, [conversion, amountGiven, currency, type])

  const rateDetail = useMemo(() => {
    if (!conversion || amountGiven <= 0) return null
    if (type === 'cross' && conversion.fromCurrency && conversion.toCurrency) {
      return formatCrossRate(
        conversion.fromCurrency,
        conversion.toCurrency,
        conversion.rateApplied
      )
    }
    return `Applied rate: ${formatRate(conversion.rateApplied)} per 1 ${currency}`
  }, [conversion, amountGiven, currency, type])

  async function handleConfirm(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!conversion || amountGiven <= 0) {
      setError('Enter a valid amount and ensure rates are configured.')
      return
    }

    setSubmitting(true)
    const result = await window.api.createTransaction({
      type,
      currency,
      to_currency: type === 'cross' ? toCurrency : undefined,
      amount_given: amountGiven,
      amount_received: conversion.amountReceived,
      rate_applied: conversion.rateApplied
    })
    setSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    const printResult = await window.api.printReceipt(result.data)
    if (printResult && 'success' in printResult && printResult.success) {
      setSuccess('Transaction logged and receipt printed.')
    } else if (printResult && 'code' in printResult) {
      setSuccess('Transaction logged successfully.')
    } else {
      const printError =
        printResult && 'error' in printResult ? printResult.error : 'Printer unavailable'
      setSuccess(`Transaction logged. Receipt not printed: ${printError}`)
    }

    setAmount('')
    setTimeout(() => setSuccess(null), 4000)
  }

  return (
    <div className="mx-auto max-w-2xl">
      <p className="mb-6 text-sm text-slate-600">
        <strong>Buy</strong> — customer gives foreign currency, receives ALL.{' '}
        <strong>Sell</strong> — customer gives ALL, receives foreign currency.{' '}
        <strong>Convert</strong> — customer swaps one foreign currency for another (e.g. EUR →
        USD), calculated through ALL using your buy/sell rates.
      </p>

      {loadingRates && (
        <p className="mb-4 text-sm text-slate-500">Loading exchange rates…</p>
      )}

      {!loadingRates && missingRates.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No rate configured for {missingRates.join(', ')}. Add rates on the Rates screen first.
        </p>
      )}

      <form
        onSubmit={handleConfirm}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <fieldset>
          <legend className="mb-3 text-sm font-medium text-slate-700">Transaction type</legend>
          <div className="flex flex-wrap gap-3">
            {TRANSACTION_TYPES.map(({ value, label }) => (
              <label
                key={value}
                className={`flex min-w-[5.5rem] flex-1 cursor-pointer items-center justify-center rounded-lg border px-4 py-3 text-sm font-medium transition-colors ${
                  type === value
                    ? 'border-navy-700 bg-navy-900 text-white'
                    : 'border-slate-300 bg-slate-50 text-slate-700 hover:border-slate-400'
                }`}
              >
                <input
                  type="radio"
                  name="type"
                  value={value}
                  checked={type === value}
                  onChange={() => setType(value)}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {type === 'cross' ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="from-currency" className="mb-1.5 block text-sm font-medium text-slate-700">
                From (customer gives)
              </label>
              <CurrencySelect
                id="from-currency"
                value={currency}
                onChange={(next) => {
                  setCurrency(next)
                  if (next === toCurrency) {
                    setToCurrency(CURRENCY_CODES.find((c) => c !== next) ?? 'USD')
                  }
                }}
              />
            </div>
            <div>
              <label htmlFor="to-currency" className="mb-1.5 block text-sm font-medium text-slate-700">
                To (customer receives)
              </label>
              <CurrencySelect
                id="to-currency"
                value={toCurrency}
                exclude={currency}
                onChange={setToCurrency}
              />
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="currency" className="mb-1.5 block text-sm font-medium text-slate-700">
              Currency
            </label>
            <CurrencySelect id="currency" value={currency} onChange={setCurrency} />
          </div>
        )}

        <div>
          <label htmlFor="amount" className="mb-1.5 block text-sm font-medium text-slate-700">
            Amount customer brings
          </label>
          <input
            id="amount"
            type="number"
            min="0"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={
              type === 'sell'
                ? 'e.g. 11450 ALL'
                : type === 'cross'
                  ? `e.g. 100 ${currency}`
                  : `e.g. 100 ${currency}`
            }
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            required
          />
          <p className="mt-1 text-xs text-slate-500">
            {type === 'sell'
              ? 'Amount in ALL'
              : type === 'cross'
                ? `Amount in ${currency}`
                : `Amount in ${currency}`}
          </p>
        </div>

        {resultText && conversion && (
          <div className="rounded-lg bg-slate-50 px-4 py-4">
            <p className="text-lg font-semibold text-navy-900">{resultText}</p>
            {rateDetail && <p className="mt-1 text-sm text-slate-600">{rateDetail}</p>}
            {type === 'cross' && currentRate && toRate && (
              <p className="mt-2 text-xs text-slate-500">
                Via ALL: {formatRate(currentRate.buy_rate)} buy {currency},{' '}
                {formatRate(toRate.sell_rate)} sell {toCurrency}
              </p>
            )}
          </div>
        )}

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
          disabled={submitting || !conversion || amountGiven <= 0}
          className="w-full rounded-lg bg-navy-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-navy-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? 'Saving…' : 'Confirm & Log'}
        </button>
      </form>
    </div>
  )
}
