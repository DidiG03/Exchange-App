import { execSync } from 'child_process'
import { unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { CharacterSet, BreakLine, PrinterTypes, ThermalPrinter } from 'node-thermal-printer'
import type { Transaction } from '../database/types'
import type { ReceiptDocument } from '../shared/printer-types'
import type { ReceiptLanguage } from '../shared/receipt-language'
import {
  buildReceiptDocument,
  formatReceiptTableRow,
  type BureauReceiptConfig
} from './receipt-format'
import { getPrinterSettings } from './settings'
import { loadPrinterDriver } from './printer-driver'
import { sendRawToNetworkPrinter } from './printer-network'
import { sendRawToWindowsPrinter } from './printer-windows-raw'

function printMandatReceipt(printer: ThermalPrinter, doc: ReceiptDocument): void {
  if (doc.voidBanner) {
    printer.alignCenter()
    printer.invert(true)
    printer.bold(true)
    printer.println(doc.voidBanner)
    printer.invert(false)
    printer.bold(false)
    printer.alignLeft()
    if (doc.voidDetail) {
      for (const line of doc.voidDetail.split('\n')) {
        printer.println(line)
      }
    }
    printer.newLine()
    printer.drawLine('-')
  }

  printer.alignCenter()
  printer.bold(true)
  printer.setTextDoubleWidth()
  printer.println(doc.bureauName)
  printer.setTextNormal()
  printer.bold(false)
  printer.newLine()

  printer.drawLine('=')
  printer.bold(true)
  printer.println(doc.mandatTitle)
  printer.bold(false)
  printer.drawLine('=')
  printer.newLine()

  printer.alignLeft()
  printer.leftRight(doc.invoiceLeft, doc.dateRight)
  printer.println(doc.timeLine)
  printer.newLine()
  printer.alignCenter()
  printer.bold(true)
  printer.println(doc.pairLine ?? '')
  printer.bold(false)
  printer.alignLeft()
  printer.newLine()

  printer.drawLine('-')
  printer.bold(true)
  printer.println(
    formatReceiptTableRow(doc.columnAmount, doc.columnRate, doc.columnConverted)
  )
  printer.bold(false)
  printer.drawLine('-')
  printer.println(formatReceiptTableRow(doc.shuma, doc.kursi, doc.shumaKonvertuar))
  printer.drawLine('-')
  printer.newLine()

  printer.alignCenter()
  printer.bold(true)
  printer.println(doc.totalLabel)
  printer.setTextDoubleHeight()
  printer.setTextDoubleWidth()
  printer.println(doc.totalAmount)
  printer.setTextNormal()
  printer.bold(false)
  printer.newLine()

  printer.drawLine('=')
  printer.alignCenter()
  printer.println(doc.footer)
  printer.alignLeft()
  printer.newLine()
  printer.bold(true)
  printer.println(doc.thankYou)
  printer.bold(false)
  printer.newLine()
}

function buildEscPosBuffer(tx: Transaction, language: ReceiptLanguage = 'sq'): Buffer {
  const settings = getPrinterSettings()
  const config: BureauReceiptConfig = {
    bureauName: settings.bureauName,
    city: settings.city
  }
  const doc = buildReceiptDocument(tx, config, language)

  const stubPath = join(tmpdir(), 'exchange-bureau-escpos.stub')
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: stubPath,
    characterSet: CharacterSet.PC852_LATIN2,
    removeSpecialCharacters: false,
    lineCharacter: '-',
    breakLine: BreakLine.WORD,
    width: 48
  })

  printMandatReceipt(printer, doc)
  printer.cut()

  return printer.getBuffer()
}

function sendRawOnMac(printerName: string, buffer: Buffer): void {
  const safeName = printerName.replace(/"/g, '\\"')
  const tmpFile = join(tmpdir(), `receipt-${Date.now()}.bin`)
  writeFileSync(tmpFile, buffer)

  try {
    execSync(`lp -d "${safeName}" -o raw "${tmpFile}"`, {
      encoding: 'utf8',
      timeout: 15000
    })
  } finally {
    try {
      unlinkSync(tmpFile)
    } catch {
      // ignore
    }
  }
}

function sendRawOnWindows(
  printerName: string,
  buffer: Buffer,
  driver: NonNullable<ReturnType<typeof loadPrinterDriver>>
): Promise<void> {
  return new Promise((resolve, reject) => {
    driver.printDirect({
      data: buffer,
      printer: printerName,
      type: 'RAW',
      success: () => resolve(),
      error: (error: Error) => reject(error)
    })
  })
}

export async function printEscPosReceiptToNetwork(
  host: string,
  port: number,
  tx: Transaction,
  language: ReceiptLanguage = 'sq'
): Promise<void> {
  const buffer = buildEscPosBuffer(tx, language)
  await sendRawToNetworkPrinter(host, port, buffer)
}

export async function printEscPosReceipt(
  printerName: string,
  tx: Transaction,
  language: ReceiptLanguage = 'sq'
): Promise<void> {
  const buffer = buildEscPosBuffer(tx, language)

  if (process.platform === 'darwin') {
    sendRawOnMac(printerName, buffer)
    return
  }

  if (process.platform === 'win32') {
    try {
      await sendRawToWindowsPrinter(printerName, buffer)
      return
    } catch (windowsError) {
      const driver = loadPrinterDriver()
      if (!driver) {
        throw windowsError instanceof Error
          ? windowsError
          : new Error('Failed to print receipt on Windows.')
      }

      try {
        await sendRawOnWindows(printerName, buffer, driver)
        return
      } catch {
        throw windowsError instanceof Error
          ? windowsError
          : new Error('Failed to print receipt on Windows.')
      }
    }
  }

  throw new Error('Unsupported platform for thermal printing')
}
