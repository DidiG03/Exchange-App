import type { Transaction, TransactionType } from '../database/types'

const LINE_WIDTH = 42

function padLine(left: string, right: string): string {
  const gap = LINE_WIDTH - left.length - right.length
  if (gap >= 1) {
    return left + ' '.repeat(gap) + right
  }
  return `${left} ${right}`
}

function formatAmount(value: number, decimals: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  }).format(value)
}

function formatAllPlain(amount: number): string {
  return `${formatAmount(Math.round(amount), 0)} ALL`
}

function formatForeignPlain(amount: number, currency: string): string {
  return `${formatAmount(amount, 2)} ${currency}`
}

function typeLabel(type: TransactionType): string {
  if (type === 'cross') return 'CONVERT'
  return type.toUpperCase()
}

function pairLabel(tx: Transaction): string {
  if (tx.type === 'cross' && tx.to_currency) {
    return `${tx.currency} -> ${tx.to_currency}`
  }
  return tx.currency
}

function formatGiven(tx: Transaction): string {
  if (tx.type === 'sell') return formatAllPlain(tx.amount_given)
  return formatForeignPlain(tx.amount_given, tx.currency)
}

function formatReceived(tx: Transaction): string {
  if (tx.type === 'buy') return formatAllPlain(tx.amount_received)
  if (tx.type === 'cross' && tx.to_currency) {
    return formatForeignPlain(tx.amount_received, tx.to_currency)
  }
  return formatForeignPlain(tx.amount_received, tx.currency)
}

function formatRateLine(tx: Transaction): string {
  if (tx.type === 'cross' && tx.to_currency) {
    return `1 ${tx.currency} = ${formatAmount(tx.rate_applied, 4)} ${tx.to_currency}`
  }
  return `${formatAmount(tx.rate_applied, 2)} ALL per 1 ${tx.currency}`
}

export function formatReceiptLines(tx: Transaction): string[] {
  const when = new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(tx.created_at))

  return [
    'EXCHANGE BUREAU',
    'Albania',
    '-'.repeat(LINE_WIDTH),
    padLine('Receipt #', String(tx.id)),
    padLine('Date', when),
    padLine('Type', typeLabel(tx.type)),
    padLine('Pair', pairLabel(tx)),
    '-'.repeat(LINE_WIDTH),
    padLine('Given', formatGiven(tx)),
    padLine('Received', formatReceived(tx)),
    padLine('Rate', formatRateLine(tx)),
    '-'.repeat(LINE_WIDTH),
    'Thank you for your business',
    ''
  ]
}
