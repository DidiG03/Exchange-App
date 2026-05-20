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

export function formatRate(rate: number): string {
  return `${ALL_FORMATTER.format(rate)} ALL`
}

export function formatCrossRate(from: string, to: string, toPerFrom: number): string {
  return `1 ${from} = ${FOREIGN_FORMATTER.format(toPerFrom)} ${to}`
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
