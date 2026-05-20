import { execSync } from 'child_process'
import { unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { CharacterSet, BreakLine, PrinterTypes, ThermalPrinter } from 'node-thermal-printer'
import type { Transaction } from '../database/types'
import { formatReceiptLines } from './receipt-format'
import { loadPrinterDriver } from './printer-driver'

function buildEscPosBuffer(tx: Transaction): Buffer {
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

  const lines = formatReceiptLines(tx)

  printer.alignCenter()
  printer.bold(true)
  printer.println(lines[0])
  printer.println(lines[1])
  printer.bold(false)
  printer.drawLine()

  printer.alignLeft()
  for (let i = 3; i < lines.length - 2; i++) {
    printer.println(lines[i])
  }

  printer.drawLine()
  printer.alignCenter()
  printer.println(lines[lines.length - 2])
  printer.newLine()
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
      // ignore cleanup errors
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

export async function printEscPosReceipt(
  printerName: string,
  tx: Transaction
): Promise<void> {
  const buffer = buildEscPosBuffer(tx)

  if (process.platform === 'darwin') {
    sendRawOnMac(printerName, buffer)
    return
  }

  if (process.platform === 'win32') {
    const driver = loadPrinterDriver()
    if (!driver) {
      throw new Error(
        'RAW printer driver missing on Windows. Run: npm install @thesusheer/electron-printer && npm run postinstall'
      )
    }
    await sendRawOnWindows(printerName, buffer, driver)
    return
  }

  throw new Error('Unsupported platform for thermal printing')
}
