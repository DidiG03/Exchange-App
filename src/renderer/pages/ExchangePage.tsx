import { FormEvent, useMemo, useState } from 'react'
import { BASE_CURRENCY } from '../../shared/currencies'
import type { CurrencyCode } from '../../shared/currencies'
import { CurrencySelect } from '../components/CurrencySelect'
import { useLiveRates } from '../hooks/useLiveRates'
import {
  buildCreateTransactionInput,
  calculateExchange,
  getMissingExchangeCurrencies
} from '../utils/exchange'
import { RECEIPT_LANGUAGES } from '../../shared/receipt-language'
import type { ReceiptLanguage } from '../../shared/receipt-language'
import { formatAmount, formatCrossRate, formatPairLabel } from '../utils/format'

export function ExchangePage(): React.JSX.Element {
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>('EUR')
  const [toCurrency, setToCurrency] = useState<CurrencyCode>(BASE_CURRENCY)
  const [amount, setAmount] = useState('')
  const { ratesByCurrency, pairRatesByKey, loading: loadingRates } = useLiveRates()
  const [receiptLanguage, setReceiptLanguage] = useState<ReceiptLanguage>('sq')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const amountGiven = parseFloat(amount) || 0

  const conversion = useMemo(
    () =>
      calculateExchange(
        fromCurrency,
        toCurrency,
        amountGiven,
        ratesByCurrency,
        pairRatesByKey
      ),
    [fromCurrency, toCurrency, amountGiven, ratesByCurrency, pairRatesByKey]
  )

  const missingRates = useMemo(
    () => getMissingExchangeCurrencies(fromCurrency, toCurrency, ratesByCurrency, pairRatesByKey),
    [fromCurrency, toCurrency, ratesByCurrency, pairRatesByKey]
  )

  const resultText = useMemo(() => {
    if (!conversion || amountGiven <= 0) return null
    return `Customer receives: ${formatAmount(conversion.amountReceived, conversion.toCurrency)}`
  }, [conversion, amountGiven])

  const rateDetail = useMemo(() => {
    if (!conversion || amountGiven <= 0) return null
    return `Applied rate: ${formatCrossRate(
      conversion.fromCurrency,
      conversion.toCurrency,
      conversion.rateApplied
    )}`
  }, [conversion, amountGiven])

  function handleFromChange(next: CurrencyCode): void {
    setFromCurrency(next)
    if (next === toCurrency) {
      setToCurrency(next === BASE_CURRENCY ? 'EUR' : BASE_CURRENCY)
    }
  }

  async function handleConfirm(event: FormEvent): Promise<void> {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (!conversion || amountGiven <= 0) {
      setError('Enter a valid amount and ensure rates are configured for this pair.')
      return
    }

    setSubmitting(true)
    const result = await window.api.createTransaction(
      buildCreateTransactionInput(fromCurrency, toCurrency, amountGiven, conversion)
    )
    setSubmitting(false)

    if (!result.success) {
      setError(result.error)
      return
    }

    const printResult = await window.api.printReceipt(result.data, receiptLanguage)
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
        Select any <strong>from → to</strong> currency pair. Rates can be set on the Rates screen
        for pairs like EUR → USD, or via ALL when one side is Lek.
      </p>

      {loadingRates && (
        <p className="mb-4 text-sm text-slate-500">Loading exchange rates…</p>
      )}

      {!loadingRates && missingRates.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          No rate configured for {missingRates.join(', ')}. Add the{' '}
          {formatPairLabel(fromCurrency, toCurrency)} rate on the Rates screen first.
        </p>
      )}

      <form
        onSubmit={handleConfirm}
        className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="from-currency" className="mb-1.5 block text-sm font-medium text-slate-700">
              From (customer gives)
            </label>
            <CurrencySelect
              id="from-currency"
              value={fromCurrency}
              includeAll
              onChange={handleFromChange}
            />
          </div>
          <div>
            <label htmlFor="to-currency" className="mb-1.5 block text-sm font-medium text-slate-700">
              To (customer receives)
            </label>
            <CurrencySelect
              id="to-currency"
              value={toCurrency}
              includeAll
              exclude={fromCurrency}
              onChange={setToCurrency}
            />
          </div>
        </div>

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
            placeholder={`e.g. 100 ${fromCurrency}`}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            required
          />
          <p className="mt-1 text-xs text-slate-500">Amount in {fromCurrency}</p>
        </div>

        <fieldset>
          <legend className="mb-3 text-sm font-medium text-slate-700">Receipt language</legend>
          <div className="flex flex-wrap gap-4">
            {RECEIPT_LANGUAGES.map(({ value, label }) => (
              <label key={value} className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="radio"
                  name="receipt-language"
                  value={value}
                  checked={receiptLanguage === value}
                  onChange={() => setReceiptLanguage(value)}
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>

        {resultText && conversion && (
          <div className="rounded-lg bg-slate-50 px-4 py-4">
            <p className="text-lg font-semibold text-navy-900">{resultText}</p>
            {rateDetail && <p className="mt-1 text-sm text-slate-600">{rateDetail}</p>}
            {conversion.rateSource === 'triangulated' && (
              <p className="mt-2 text-xs text-slate-500">
                Calculated via ALL using your buy/sell rates. Set a direct{' '}
                {formatPairLabel(fromCurrency, toCurrency)} rate on the Rates screen to override.
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
