import type { ExchangeRate, SupportedCurrency, TransactionType } from '../../database/types'

export interface ConversionResult {
  amountReceived: number
  rateApplied: number
  receivedLabel: string
  receivedIsAll: boolean
  fromCurrency?: SupportedCurrency
  toCurrency?: SupportedCurrency
}

export function calculateConversion(
  type: TransactionType,
  currency: SupportedCurrency,
  amountGiven: number,
  rate: ExchangeRate | null
): ConversionResult | null {
  if (type === 'cross') return null
  if (!rate || amountGiven <= 0 || !Number.isFinite(amountGiven)) {
    return null
  }

  const rateApplied = type === 'buy' ? rate.buy_rate : rate.sell_rate

  if (type === 'buy') {
    return {
      amountReceived: amountGiven * rateApplied,
      rateApplied,
      receivedLabel: 'ALL',
      receivedIsAll: true
    }
  }

  return {
    amountReceived: amountGiven / rateApplied,
    rateApplied,
    receivedLabel: currency,
    receivedIsAll: false
  }
}

/** Cross-rate via ALL: bureau buys FROM at buy rate, sells TO at sell rate. */
export function calculateCrossConversion(
  fromCurrency: SupportedCurrency,
  toCurrency: SupportedCurrency,
  amountGiven: number,
  fromRate: ExchangeRate | null,
  toRate: ExchangeRate | null
): ConversionResult | null {
  if (
    fromCurrency === toCurrency ||
    !fromRate ||
    !toRate ||
    amountGiven <= 0 ||
    !Number.isFinite(amountGiven)
  ) {
    return null
  }

  const allValue = amountGiven * fromRate.buy_rate
  const amountReceived = allValue / toRate.sell_rate
  const rateApplied = fromRate.buy_rate / toRate.sell_rate

  return {
    amountReceived,
    rateApplied,
    receivedLabel: toCurrency,
    receivedIsAll: false,
    fromCurrency,
    toCurrency
  }
}
