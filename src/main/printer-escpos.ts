import { execSync } from 'child_process'
import { unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { CharacterSet, BreakLine, PrinterTypes, ThermalPrinter } from 'node-thermal-printer'
import type { Transaction } from '../database/types'
import type { ReceiptDocument } from '../shared/printer-types'
import {
  buildReceiptDocument,
  centerInBox,
  type BureauReceiptConfig
} from './receipt-format'
import { getPrinterSettings } from './settings'
import { loadPrinterDriver } from './printer-driver'
import { sendRawToNetworkPrinter } from './printer-network'

const LINE_WIDTH = 48
const BOX_WIDTH = 40

function printMandatReceipt(printer: ThermalPrinter, doc: ReceiptDocument): void {
  printer.alignLeft()
  printer.bold(true)
  printer.println(doc.bureauName)
  printer.bold(false)

  printer.println('.'.repeat(LINE_WIDTH))
  printer.alignCenter()
  printer.bold(true)
  printer.println(doc.mandatTitle)
  printer.bold(false)
  printer.alignLeft()
  printer.newLine()

  if (doc.voidBanner) {
    printer.alignCenter()
    printer.bold(true)
    printer.println(doc.voidBanner)
    printer.bold(false)
    printer.alignLeft()
    if (doc.voidDetail) {
      for (const line of doc.voidDetail.split('\n')) {
        printer.println(line)
      }
    }
    printer.newLine()
  }

  printer.println(doc.invoiceLine)
  printer.println(doc.clientLine)
  printer.newLine()

  printer.println(
    padColumns('Shuma', 'Kursi', 'Shuma e Konvert.')
  )
  printer.println(padColumns(doc.shuma, doc.kursi, doc.shumaKonvertuar))
  printer.newLine()

  const boxLine = '-'.repeat(BOX_WIDTH)
  const centered = centerInBox(doc.totalBox, BOX_WIDTH)

  printer.alignCenter()
  printer.println(`+${boxLine}+`)
  printer.bold(true)
  printer.println(`|${centered}|`)
  printer.bold(false)
  printer.println(`+${boxLine}+`)
  printer.newLine()

  printer.alignLeft()
  printer.println(doc.footer)
  printer.newLine()
}

function padColumns(a: string, b: string, c: string): string {
  const w1 = 14
  const w2 = 8
  const w3 = 22
  const p = (t: string, w: number) => (t.length >= w ? t.slice(0, w) : t + ' '.repeat(w - t.length))
  return p(a, w1) + p(b, w2) + p(c, w3)
}

function buildEscPosBuffer(tx: Transaction): Buffer {
  const settings = getPrinterSettings()
  const config: BureauReceiptConfig = {
    bureauName: settings.bureauName,
    city: settings.city
  }
  const doc = buildReceiptDocument(tx, config)

  const stubPath = join(tmpdir(), 'exchange-bureau-escpos.stub')
  const printer = new ThermalPrinter({
    type: PrinterTypes.EPSON,
    interface: stubPath,
    characterSet: CharacterSet.PC852_LATIN2,
    removeSpecialCharacters: false,
    lineCharacter: '.',
    breakLine: BreakLine.WORD,
    width: LINE_WIDTH
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
  tx: Transaction
): Promise<void> {
  const buffer = buildEscPosBuffer(tx)
  await sendRawToNetworkPrinter(host, port, buffer)
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
