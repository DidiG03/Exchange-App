import { execSync } from 'child_process'
import type { Transaction } from '../database/types'
import type { PrintResult, PrinterSettings } from '../shared/printer-types'
import { printEscPosReceipt } from './printer-escpos'
import { getPrinterSettings, savePrinterSettings } from './settings'

export { getPrinterSettings, savePrinterSettings }

export function listSystemPrinters(): string[] {
  if (process.platform === 'win32') {
    try {
      const output = execSync(
        'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
        { encoding: 'utf8', timeout: 8000 }
      )
      return output
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }

  if (process.platform === 'darwin') {
    try {
      const output = execSync('lpstat -p', { encoding: 'utf8', timeout: 8000 })
      return output
        .split(/\r?\n/)
        .filter((line) => line.startsWith('printer '))
        .map((line) => line.replace(/^printer\s+(\S+).*/, '$1'))
    } catch {
      return []
    }
  }

  return []
}

export async function printTransactionReceipt(tx: Transaction): Promise<PrintResult> {
  const settings = getPrinterSettings()

  if (!settings.printEnabled) {
    return { success: false, error: 'Printing is disabled in settings.' }
  }

  if (!settings.printerName) {
    return {
      success: false,
      error: 'No printer configured. Set the printer name on the Printer screen.'
    }
  }

  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return { success: false, error: 'Receipt printing is supported on Windows and macOS only.' }
  }

  try {
    await printEscPosReceipt(settings.printerName, tx)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to print receipt'
    }
  }
}

export function updatePrinterSettings(settings: PrinterSettings): PrinterSettings {
  return savePrinterSettings(settings)
}
