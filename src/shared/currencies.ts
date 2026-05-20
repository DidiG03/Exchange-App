/** Foreign currencies paired against ALL (Albanian Lek). */
export const CURRENCY_CODES = [
  'EUR',
  'USD',
  'GBP',
  'CHF',
  'TRY',
  'CAD',
  'AUD',
  'JPY',
  'CNY',
  'SAR',
  'AED',
  'KWD',
  'QAR',
  'NOK',
  'SEK',
  'DKK',
  'PLN',
  'CZK',
  'HUF',
  'RON',
  'BGN',
  'RUB',
  'INR',
  'BRL',
  'MXN',
  'ZAR',
  'HKD',
  'SGD',
  'KRW',
  'THB',
  'ILS',
  'EGP',
  'NZD'
] as const

export type SupportedCurrency = (typeof CURRENCY_CODES)[number]

export interface CurrencyGroup {
  label: string
  codes: SupportedCurrency[]
}

export const CURRENCY_GROUPS: CurrencyGroup[] = [
  {
    label: 'Major',
    codes: ['EUR', 'USD', 'GBP', 'CHF']
  },
  {
    label: 'Europe & nearby',
    codes: ['TRY', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK', 'HUF', 'RON', 'BGN', 'RUB']
  },
  {
    label: 'Americas',
    codes: ['CAD', 'BRL', 'MXN']
  },
  {
    label: 'Asia & Pacific',
    codes: ['JPY', 'CNY', 'INR', 'HKD', 'SGD', 'KRW', 'THB', 'NZD', 'AUD']
  },
  {
    label: 'Middle East & Africa',
    codes: ['SAR', 'AED', 'KWD', 'QAR', 'ILS', 'EGP', 'ZAR']
  }
]

export function isSupportedCurrency(value: string): value is SupportedCurrency {
  return (CURRENCY_CODES as readonly string[]).includes(value)
}

/** Starter buy/sell rates (ALL per 1 unit) — replace with real bureau prices on Rates screen. */
export const DEFAULT_RATE_SEEDS: { currency: SupportedCurrency; buy_rate: number; sell_rate: number }[] =
  [
    { currency: 'EUR', buy_rate: 98.5, sell_rate: 102.5 },
    { currency: 'USD', buy_rate: 92, sell_rate: 96 },
    { currency: 'GBP', buy_rate: 115, sell_rate: 120 },
    { currency: 'CHF', buy_rate: 105, sell_rate: 110 },
    { currency: 'TRY', buy_rate: 2.85, sell_rate: 3.15 },
    { currency: 'CAD', buy_rate: 68, sell_rate: 72 },
    { currency: 'AUD', buy_rate: 60, sell_rate: 64 },
    { currency: 'JPY', buy_rate: 0.6, sell_rate: 0.65 },
    { currency: 'CNY', buy_rate: 12.8, sell_rate: 13.5 },
    { currency: 'SAR', buy_rate: 24.5, sell_rate: 26 },
    { currency: 'AED', buy_rate: 24.5, sell_rate: 26 },
    { currency: 'KWD', buy_rate: 300, sell_rate: 310 },
    { currency: 'QAR', buy_rate: 24.5, sell_rate: 26 },
    { currency: 'NOK', buy_rate: 8.8, sell_rate: 9.5 },
    { currency: 'SEK', buy_rate: 8.8, sell_rate: 9.5 },
    { currency: 'DKK', buy_rate: 13.2, sell_rate: 14 },
    { currency: 'PLN', buy_rate: 23, sell_rate: 25 },
    { currency: 'CZK', buy_rate: 4, sell_rate: 4.2 },
    { currency: 'HUF', buy_rate: 0.26, sell_rate: 0.28 },
    { currency: 'RON', buy_rate: 19.5, sell_rate: 21 },
    { currency: 'BGN', buy_rate: 50, sell_rate: 53 },
    { currency: 'RUB', buy_rate: 1, sell_rate: 1.05 },
    { currency: 'INR', buy_rate: 1.1, sell_rate: 1.15 },
    { currency: 'BRL', buy_rate: 17.5, sell_rate: 19 },
    { currency: 'MXN', buy_rate: 5.1, sell_rate: 5.5 },
    { currency: 'ZAR', buy_rate: 5, sell_rate: 5.3 },
    { currency: 'HKD', buy_rate: 11.8, sell_rate: 12.5 },
    { currency: 'SGD', buy_rate: 68, sell_rate: 72 },
    { currency: 'KRW', buy_rate: 0.07, sell_rate: 0.075 },
    { currency: 'THB', buy_rate: 2.6, sell_rate: 2.8 },
    { currency: 'ILS', buy_rate: 24.5, sell_rate: 26 },
    { currency: 'EGP', buy_rate: 1.9, sell_rate: 2.05 },
    { currency: 'NZD', buy_rate: 56, sell_rate: 59 }
  ]
