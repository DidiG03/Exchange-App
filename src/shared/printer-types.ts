export interface PrinterSettings {
  printerName: string
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
  invoiceLine: string
  clientLine: string
  shuma: string
  kursi: string
  shumaKonvertuar: string
  totalBox: string
  footer: string
  voidBanner?: string
  voidDetail?: string
}
