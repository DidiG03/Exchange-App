import type { Transaction } from '../database/types'
import type { ReceiptDocument } from '../shared/printer-types'

const LINE_WIDTH = 48
const COL_SHUMA = 14
const COL_KURSI = 8
const COL_KONVERT = 22

export interface BureauReceiptConfig {
  bureauName: string
  city: string
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width)
  return text + ' '.repeat(width - text.length)
}

function padLine(left: string, right: string): string {
  const gap = LINE_WIDTH - left.length - right.length
  if (gap >= 1) return left + ' '.repeat(gap) + right
  return `${left} ${right}`
}

/** Albanian style: 1.097.868,50 */
export function formatAlbanianNumber(value: number, decimals: number): string {
  const rounded =
    decimals === 0 ? Math.round(value) : Math.round(value * 10 ** decimals) / 10 ** decimals
  const [intPart, decPart] = rounded.toFixed(decimals).split('.')
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  if (decimals === 0) return withThousands
  return `${withThousands},${decPart}`
}

function formatKursi(rate: number): string {
  return formatAlbanianNumber(rate, 1)
}

function formatLek(amount: number, decimals = 0): string {
  return `${formatAlbanianNumber(amount, decimals)} LEK`
}

function formatCurrency(amount: number, currency: string, decimals = 2): string {
  return `${formatAlbanianNumber(amount, decimals)} ${currency}`
}

function formatColumns(shuma: string, kursi: string, konvert: string): string {
  return padRight(shuma, COL_SHUMA) + padRight(kursi, COL_KURSI) + padRight(konvert, COL_KONVERT)
}

function formatDateParts(iso: string): { date: string; dateTime: string } {
  const d = new Date(iso)
  const date = d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })
  const time = d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  })
  return { date, dateTime: `${date} ${time}` }
}

function buildAmounts(tx: Transaction): {
  shuma: string
  kursi: string
  shumaKonvertuar: string
  totalBox: string
} {
  if (tx.type === 'buy') {
    const shuma = formatCurrency(tx.amount_given, tx.currency, 0)
    const kursi = formatKursi(tx.rate_applied)
    const konvert = formatLek(tx.amount_received, 0)
    const totalBox = formatLek(tx.amount_received, 2)
    return { shuma, kursi, shumaKonvertuar: konvert, totalBox }
  }

  if (tx.type === 'sell') {
    const shuma = formatLek(tx.amount_given, 0)
    const kursi = formatKursi(tx.rate_applied)
    const konvert = formatCurrency(tx.amount_received, tx.currency, 0)
    const totalBox = formatCurrency(tx.amount_received, tx.currency, 2)
    return { shuma, kursi, shumaKonvertuar: konvert, totalBox }
  }

  const to = tx.to_currency ?? tx.currency
  const shuma = formatCurrency(tx.amount_given, tx.currency, 0)
  const kursi = formatKursi(tx.rate_applied)
  const konvert = formatCurrency(tx.amount_received, to, 0)
  const totalBox = formatCurrency(tx.amount_received, to, 2)
  return { shuma, kursi, shumaKonvertuar: konvert, totalBox }
}

export function buildReceiptDocument(
  tx: Transaction,
  config: BureauReceiptConfig
): ReceiptDocument {
  const { date, dateTime } = formatDateParts(tx.created_at)
  const amounts = buildAmounts(tx)

  const doc: ReceiptDocument = {
    bureauName: config.bureauName.toUpperCase(),
    mandatTitle: 'Mandat Konvertim Valute',
    invoiceLine: padLine(`Nr. Fatures ${tx.id}`, `Data ${date}`),
    clientLine: 'Klienti  .',
    shuma: amounts.shuma,
    kursi: amounts.kursi,
    shumaKonvertuar: amounts.shumaKonvertuar,
    totalBox: amounts.totalBox,
    footer: `${config.city}, me ${dateTime}`
  }

  if (tx.voided_at) {
    const voidWhen = formatDateParts(tx.voided_at).dateTime
    doc.voidBanner = '*** ANULLUAR ***'
    doc.voidDetail = [
      `Arsye: ${tx.void_reason ?? ''}`,
      `Operator: ${tx.voided_by_username ?? ''}`,
      `Me: ${voidWhen}`
    ].join('\n')
  }

  return doc
}

/** Legacy line list for debugging */
export function formatReceiptLines(tx: Transaction, config: BureauReceiptConfig): string[] {
  const doc = buildReceiptDocument(tx, config)
  return [
    doc.bureauName,
    '.'.repeat(LINE_WIDTH),
    doc.mandatTitle,
    doc.invoiceLine,
    doc.clientLine,
    '',
    formatColumns('Shuma', 'Kursi', 'Shuma e Konvert.'),
    formatColumns(doc.shuma, doc.kursi, doc.shumaKonvertuar),
    doc.totalBox,
    doc.footer,
    ''
  ]
}

export function centerInBox(text: string, width: number): string {
  const inner = width - 2
  const trimmed = text.length > inner ? text.slice(0, inner) : text
  const pad = Math.max(0, inner - trimmed.length)
  const left = Math.floor(pad / 2)
  return ' '.repeat(left) + trimmed + ' '.repeat(pad - left)
}
