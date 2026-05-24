export type PrinterConnectionType = 'system' | 'network'

export interface NetworkPrinterDevice {
  host: string
  port: number
  label: string
}

export interface NetworkPrinterTestResult {
  success: boolean
  error?: string
  port?: number
}

export interface PrinterSettings {
  connectionType: PrinterConnectionType
  printerName: string
  printerHost: string
  printerPort: number
  printEnabled: boolean
  bureauName: string
  city: string
}

export interface PrintResult {
  success: boolean
  error?: string
}

export interface ReceiptDocument {
  bureauName: string
  mandatTitle: string
  invoiceLeft: string
  dateRight: string
  timeLine: string
  pairLine?: string
  columnAmount: string
  columnRate: string
  columnConverted: string
  shuma: string
  kursi: string
  shumaKonvertuar: string
  totalLabel: string
  totalAmount: string
  footer: string
  thankYou: string
  voidBanner?: string
  voidDetail?: string
}
