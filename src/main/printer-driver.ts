/* eslint-disable @typescript-eslint/no-require-imports */

export interface PrinterDriverModule {
  getPrinters: () => Array<{ name: string; attributes?: string[]; status?: string }>
  getPrinter: (name: string) => { name: string; status?: string } | undefined
  printDirect: (options: {
    data: Buffer
    printer: string
    type: string
    docname?: string | false
    success: (jobId: string) => void
    error: (error: Error) => void
  }) => void
}

export function loadPrinterDriver(): PrinterDriverModule | null {
  const candidates = ['@thesusheer/electron-printer', 'electron-printer', 'printer']

  for (const name of candidates) {
    try {
      const driver = require(name) as PrinterDriverModule
      if (driver?.printDirect && driver?.getPrinter) {
        return driver
      }
    } catch {
      // try next driver
    }
  }

  return null
}
