import type { CurrencyCode, SupportedCurrency } from '../../shared/currencies'
import type { CreateTransactionInput, ExchangePairRate, ExchangeRate, TransactionType } from '../../database/types'

export interface ExchangeConversionResult {
  amountReceived: number
  rateApplied: number
  fromCurrency: CurrencyCode
  toCurrency: CurrencyCode
  rateSource: 'direct' | 'reverse' | 'all' | 'triangulated'
}

export function pairKey(from: CurrencyCode, to: CurrencyCode): string {
  return `${from}:${to}`
}

export function derivePairFromAll(
  from: SupportedCurrency,
  to: SupportedCurrency,
  fromRate: ExchangeRate,
  toRate: ExchangeRate
): { buy_rate: number; sell_rate: number } {
  return {
    buy_rate: fromRate.buy_rate / toRate.sell_rate,
    sell_rate: fromRate.sell_rate / toRate.buy_rate
  }
}

export function calculateExchange(
  from: CurrencyCode,
  to: CurrencyCode,
  amountGiven: number,
  allRates: Partial<Record<SupportedCurrency, ExchangeRate>>,
  pairRates: Partial<Record<string, ExchangePairRate>>
): ExchangeConversionResult | null {
  if (from === to || amountGiven <= 0 || !Number.isFinite(amountGiven)) {
    return null
  }

  if (from !== 'ALL' && to !== 'ALL') {
    const direct = pairRates[pairKey(from, to)]
    if (direct) {
      return {
        amountReceived: amountGiven * direct.buy_rate,
        rateApplied: direct.buy_rate,
        fromCurrency: from,
        toCurrency: to,
        rateSource: 'direct'
      }
    }

    const reverse = pairRates[pairKey(to, from)]
    if (reverse && reverse.sell_rate > 0) {
      const rateApplied = 1 / reverse.sell_rate
      return {
        amountReceived: amountGiven * rateApplied,
        rateApplied,
        fromCurrency: from,
        toCurrency: to,
        rateSource: 'reverse'
      }
    }
  }

  if (to === 'ALL' && from !== 'ALL') {
    const rate = allRates[from]
    if (!rate) return null
    return {
      amountReceived: amountGiven * rate.buy_rate,
      rateApplied: rate.buy_rate,
      fromCurrency: from,
      toCurrency: to,
      rateSource: 'all'
    }
  }

  if (from === 'ALL' && to !== 'ALL') {
    const rate = allRates[to]
    if (!rate || rate.sell_rate <= 0) return null
    return {
      amountReceived: amountGiven / rate.sell_rate,
      rateApplied: rate.sell_rate,
      fromCurrency: from,
      toCurrency: to,
      rateSource: 'all'
    }
  }

  if (from !== 'ALL' && to !== 'ALL') {
    const fromRate = allRates[from]
    const toRate = allRates[to]
    if (!fromRate || !toRate || toRate.sell_rate <= 0) return null
    const rateApplied = fromRate.buy_rate / toRate.sell_rate
    return {
      amountReceived: amountGiven * rateApplied,
      rateApplied,
      fromCurrency: from,
      toCurrency: to,
      rateSource: 'triangulated'
    }
  }

  return null
}

export function resolveTransactionType(
  from: CurrencyCode,
  to: CurrencyCode
): TransactionType {
  if (from !== 'ALL' && to === 'ALL') return 'buy'
  if (from === 'ALL' && to !== 'ALL') return 'sell'
  return 'cross'
}

export function buildCreateTransactionInput(
  from: CurrencyCode,
  to: CurrencyCode,
  amountGiven: number,
  conversion: ExchangeConversionResult
): CreateTransactionInput {
  const type = resolveTransactionType(from, to)

  if (type === 'buy') {
    return {
      type,
      currency: from as SupportedCurrency,
      amount_given: amountGiven,
      amount_received: conversion.amountReceived,
      rate_applied: conversion.rateApplied
    }
  }

  if (type === 'sell') {
    return {
      type,
      currency: to as SupportedCurrency,
      amount_given: amountGiven,
      amount_received: conversion.amountReceived,
      rate_applied: conversion.rateApplied
    }
  }

  return {
    type: 'cross',
    currency: from as SupportedCurrency,
    to_currency: to as SupportedCurrency,
    amount_given: amountGiven,
    amount_received: conversion.amountReceived,
    rate_applied: conversion.rateApplied
  }
}

export function getMissingExchangeCurrencies(
  from: CurrencyCode,
  to: CurrencyCode,
  allRates: Partial<Record<SupportedCurrency, ExchangeRate>>,
  pairRates: Partial<Record<string, ExchangePairRate>>
): CurrencyCode[] {
  if (from === to) return [from]
  if (calculateExchange(from, to, 1, allRates, pairRates)) return []

  const missing = new Set<CurrencyCode>()
  if (from !== 'ALL' && !allRates[from]) missing.add(from)
  if (to !== 'ALL' && !allRates[to]) missing.add(to)
  return [...missing]
}
