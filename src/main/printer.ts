import { exec } from 'child_process'
import { promisify } from 'util'
import type { Transaction } from '../database/types'
import type { NetworkPrinterDevice, NetworkPrinterTestResult, PrintResult, PrinterSettings } from '../shared/printer-types'
import type { ReceiptLanguage } from '../shared/receipt-language'
import { isReceiptLanguage } from '../shared/receipt-language'
import { printEscPosReceipt, printEscPosReceiptToNetwork } from './printer-escpos'
import { printWindowsTestReceipt } from './printer-windows-raw'
import { scanNetworkPrinters, testNetworkPrinterConnection } from './printer-network'
import { getPrinterSettings, savePrinterSettings } from './settings'

export { getPrinterSettings, savePrinterSettings }

const execAsync = promisify(exec)

export async function listSystemPrinters(): Promise<string[]> {
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execAsync(
        'powershell -NoProfile -Command "Get-Printer | Select-Object -ExpandProperty Name"',
        { encoding: 'utf8', timeout: 8000, windowsHide: true }
      )
      return stdout
        .split(/\r?\n/)
        .map((name) => name.trim())
        .filter(Boolean)
    } catch {
      return []
    }
  }

  if (process.platform === 'darwin') {
    try {
      const { stdout } = await execAsync('lpstat -p', { encoding: 'utf8', timeout: 8000 })
      return stdout
        .split(/\r?\n/)
        .filter((line) => line.startsWith('printer '))
        .map((line) => line.replace(/^printer\s+(\S+).*/, '$1'))
    } catch {
      return []
    }
  }

  return []
}

export async function listNetworkPrinters(knownHost?: string): Promise<NetworkPrinterDevice[]> {
  return scanNetworkPrinters({ knownHost })
}

export async function testNetworkPrinter(
  host: string,
  port: number
): Promise<NetworkPrinterTestResult> {
  return testNetworkPrinterConnection(host, port)
}

export async function printTransactionReceipt(
  tx: Transaction,
  language: ReceiptLanguage = 'sq'
): Promise<PrintResult> {
  const settings = getPrinterSettings()
  const receiptLanguage = isReceiptLanguage(language) ? language : 'sq'

  if (!settings.printEnabled) {
    return { success: false, error: 'Printing is disabled in settings.' }
  }

  if (settings.connectionType === 'network') {
    if (!settings.printerHost.trim()) {
      return {
        success: false,
        error: 'No network printer configured. Set the printer IP in Settings.'
      }
    }

    try {
      await printEscPosReceiptToNetwork(
        settings.printerHost.trim(),
        settings.printerPort,
        tx,
        receiptLanguage
      )
      return { success: true }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to print receipt'
      }
    }
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
    await printEscPosReceipt(settings.printerName, tx, receiptLanguage)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to print receipt'
    }
  }
}

export async function testLocalPrinter(printerName: string): Promise<PrintResult> {
  const trimmedName = printerName.trim()
  if (!trimmedName) {
    return { success: false, error: 'Select or enter the printer name from Windows first.' }
  }

  if (process.platform !== 'win32') {
    return {
      success: false,
      error: 'Local printer test is only needed on Windows. Save settings and run a transaction to test printing.'
    }
  }

  try {
    await printWindowsTestReceipt(trimmedName)
    return { success: true }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Test print failed.'
    }
  }
}

export function updatePrinterSettings(settings: PrinterSettings): PrinterSettings {
  return savePrinterSettings(settings)
}
