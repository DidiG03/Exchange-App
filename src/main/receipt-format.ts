import type { Transaction } from '../database/types'
import type { ReceiptDocument } from '../shared/printer-types'
import type { ReceiptLanguage } from '../shared/receipt-language'

const LINE_WIDTH = 48

export interface BureauReceiptConfig {
  bureauName: string
  city: string
}

const RECEIPT_COPY = {
  sq: {
    mandatTitle: 'Mandat Konvertim Valute',
    invoicePrefix: 'Nr. Fatures',
    datePrefix: 'Data',
    timePrefix: 'Ora',
    columnAmount: 'Shuma',
    columnRate: 'Kursi',
    columnConverted: 'Konvertuar',
    totalLabel: 'TOTALI',
    thankYou: 'Faleminderit!',
    voidBanner: '*** ANULLUAR ***',
    voidReason: 'Arsye',
    voidOperator: 'Operator',
    voidAt: 'Me',
    footerJoiner: 'me'
  },
  en: {
    mandatTitle: 'Currency Exchange Receipt',
    invoicePrefix: 'Invoice No.',
    datePrefix: 'Date',
    timePrefix: 'Time',
    columnAmount: 'Amount',
    columnRate: 'Rate',
    columnConverted: 'Converted',
    totalLabel: 'TOTAL',
    thankYou: 'Thank you!',
    voidBanner: '*** VOIDED ***',
    voidReason: 'Reason',
    voidOperator: 'Operator',
    voidAt: 'At',
    footerJoiner: 'on'
  }
} as const

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

function formatDateParts(iso: string): { date: string; time: string; dateTime: string } {
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
  return { date, time, dateTime: `${date} ${time}` }
}

function buildPairLine(tx: Transaction): string {
  if (tx.type === 'buy') return `${tx.currency}  -->  ALL`
  if (tx.type === 'sell') return `ALL  -->  ${tx.currency}`
  const to = tx.to_currency ?? tx.currency
  return `${tx.currency}  -->  ${to}`
}

function buildAmounts(tx: Transaction): {
  shuma: string
  kursi: string
  shumaKonvertuar: string
  totalAmount: string
} {
  if (tx.type === 'buy') {
    const shuma = formatCurrency(tx.amount_given, tx.currency, 0)
    const kursi = formatKursi(tx.rate_applied)
    const konvert = formatLek(tx.amount_received, 0)
    const totalAmount = formatLek(tx.amount_received, 2)
    return { shuma, kursi, shumaKonvertuar: konvert, totalAmount }
  }

  if (tx.type === 'sell') {
    const shuma = formatLek(tx.amount_given, 0)
    const kursi = formatKursi(tx.rate_applied)
    const konvert = formatCurrency(tx.amount_received, tx.currency, 0)
    const totalAmount = formatCurrency(tx.amount_received, tx.currency, 2)
    return { shuma, kursi, shumaKonvertuar: konvert, totalAmount }
  }

  const to = tx.to_currency ?? tx.currency
  const shuma = formatCurrency(tx.amount_given, tx.currency, 0)
  const kursi = formatKursi(tx.rate_applied)
  const konvert = formatCurrency(tx.amount_received, to, 0)
  const totalAmount = formatCurrency(tx.amount_received, to, 2)
  return { shuma, kursi, shumaKonvertuar: konvert, totalAmount }
}

export function buildReceiptDocument(
  tx: Transaction,
  config: BureauReceiptConfig,
  language: ReceiptLanguage = 'sq'
): ReceiptDocument {
  const copy = RECEIPT_COPY[language]
  const { date, time, dateTime } = formatDateParts(tx.created_at)
  const amounts = buildAmounts(tx)

  const doc: ReceiptDocument = {
    bureauName: config.bureauName.toUpperCase(),
    mandatTitle: copy.mandatTitle,
    invoiceLeft: `${copy.invoicePrefix} ${tx.id}`,
    dateRight: `${copy.datePrefix} ${date}`,
    timeLine: `${copy.timePrefix} ${time}`,
    pairLine: buildPairLine(tx),
    columnAmount: copy.columnAmount,
    columnRate: copy.columnRate,
    columnConverted: copy.columnConverted,
    shuma: amounts.shuma,
    kursi: amounts.kursi,
    shumaKonvertuar: amounts.shumaKonvertuar,
    totalLabel: copy.totalLabel,
    totalAmount: amounts.totalAmount,
    footer: `${config.city}, ${copy.footerJoiner} ${dateTime}`,
    thankYou: copy.thankYou
  }

  if (tx.voided_at) {
    const voidWhen = formatDateParts(tx.voided_at).dateTime
    doc.voidBanner = copy.voidBanner
    doc.voidDetail = [
      `${copy.voidReason}: ${tx.void_reason ?? ''}`,
      `${copy.voidOperator}: ${tx.voided_by_username ?? ''}`,
      `${copy.voidAt}: ${voidWhen}`
    ].join('\n')
  }

  return doc
}

/** Legacy line list for debugging */
export function formatReceiptLines(
  tx: Transaction,
  config: BureauReceiptConfig,
  language: ReceiptLanguage = 'sq'
): string[] {
  const doc = buildReceiptDocument(tx, config, language)
  const lines = [
    doc.bureauName,
    doc.mandatTitle,
    `${doc.invoiceLeft} | ${doc.dateRight}`,
    doc.timeLine,
    doc.pairLine ?? '',
    '',
    formatReceiptTableRow(doc.columnAmount, doc.columnRate, doc.columnConverted),
    formatReceiptTableRow(doc.shuma, doc.kursi, doc.shumaKonvertuar),
    `${doc.totalLabel}: ${doc.totalAmount}`,
    doc.footer,
    doc.thankYou,
    ''
  ]
  return lines.filter((line, index, arr) => line !== '' || index < arr.length - 1)
}

const COL_AMOUNT = 16
const COL_RATE = 10
const COL_CONVERTED = 22

function padColumn(text: string, width: number, align: 'left' | 'center' | 'right' = 'left'): string {
  const trimmed = text.length > width ? text.slice(0, width) : text
  const pad = width - trimmed.length
  if (align === 'right') return ' '.repeat(pad) + trimmed
  if (align === 'center') {
    const left = Math.floor(pad / 2)
    return ' '.repeat(left) + trimmed + ' '.repeat(pad - left)
  }
  return trimmed + ' '.repeat(pad)
}

/** Single-line three-column row (48 chars) — avoids thermal printer table wrap glitches */
export function formatReceiptTableRow(amount: string, rate: string, converted: string): string {
  return (
    padColumn(amount, COL_AMOUNT, 'left') +
    padColumn(rate, COL_RATE, 'center') +
    padColumn(converted, COL_CONVERTED, 'right')
  )
}

export function centerText(text: string, width: number): string {
  const trimmed = text.length > width ? text.slice(0, width) : text
  const pad = Math.max(0, width - trimmed.length)
  const left = Math.floor(pad / 2)
  return ' '.repeat(left) + trimmed + ' '.repeat(pad - left)
}
