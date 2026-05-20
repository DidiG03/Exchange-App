export interface PrinterSettings {
  printerName: string
  printEnabled: boolean
}

export interface PrintResult {
  success: boolean
  error?: string
}
