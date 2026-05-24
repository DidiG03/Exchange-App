import type { CurrencyCode } from '../../shared/currencies'

const ALL_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0
})

const FOREIGN_FORMATTER = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
})

export function formatAll(amount: number): string {
  return `${ALL_FORMATTER.format(Math.round(amount))} ALL`
}

export function formatForeign(amount: number, currency: string): string {
  return `${FOREIGN_FORMATTER.format(amount)} ${currency}`
}

export function formatAmount(amount: number, currency: CurrencyCode): string {
  if (currency === 'ALL') return formatAll(amount)
  return formatForeign(amount, currency)
}

export function formatRate(rate: number): string {
  return `${ALL_FORMATTER.format(rate)} ALL`
}

export function formatCrossRate(from: string, to: string, toPerFrom: number): string {
  if (to === 'ALL') {
    return `1 ${from} = ${ALL_FORMATTER.format(toPerFrom)} ALL`
  }
  if (from === 'ALL') {
    return `${ALL_FORMATTER.format(toPerFrom)} ALL = 1 ${to}`
  }
  return `1 ${from} = ${FOREIGN_FORMATTER.format(toPerFrom)} ${to}`
}

export function formatPairRate(from: string, to: string, rate: number): string {
  if (to === 'ALL' || from === 'ALL') {
    return formatCrossRate(from, to, rate)
  }
  return `1 ${from} = ${FOREIGN_FORMATTER.format(rate)} ${to}`
}

export function formatPairLabel(from: string, to: string): string {
  return `${from} → ${to}`
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(iso))
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
