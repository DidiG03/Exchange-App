import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { PrinterConnectionType, PrinterSettings } from '../shared/printer-types'

const DEFAULT_SETTINGS: PrinterSettings = {
  connectionType: 'system',
  printerName: '',
  printerHost: '',
  printerPort: 9100,
  printEnabled: true,
  bureauName: 'KEMBIM VALUTOR',
  city: 'Durres'
}

function getSettingsPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return join(dir, 'printer-settings.json')
}

function parseConnectionType(value: unknown): PrinterConnectionType {
  return value === 'network' ? 'network' : 'system'
}

function parsePrinterPort(value: unknown): number {
  const port = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return DEFAULT_SETTINGS.printerPort
  }
  return port
}

export function isValidIpv4(host: string): boolean {
  const parts = host.trim().split('.')
  if (parts.length !== 4) return false
  return parts.every((part) => {
    if (!/^\d+$/.test(part)) return false
    const value = Number(part)
    return value >= 0 && value <= 255
  })
}

export function getPrinterSettings(): PrinterSettings {
  const path = getSettingsPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<PrinterSettings>
    return {
      connectionType: parseConnectionType(parsed.connectionType),
      printerName: typeof parsed.printerName === 'string' ? parsed.printerName : '',
      printerHost: typeof parsed.printerHost === 'string' ? parsed.printerHost : '',
      printerPort: parsePrinterPort(parsed.printerPort),
      printEnabled: parsed.printEnabled !== false,
      bureauName:
        typeof parsed.bureauName === 'string' && parsed.bureauName.trim()
          ? parsed.bureauName.trim()
          : DEFAULT_SETTINGS.bureauName,
      city:
        typeof parsed.city === 'string' && parsed.city.trim()
          ? parsed.city.trim()
          : DEFAULT_SETTINGS.city
    }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function savePrinterSettings(settings: PrinterSettings): PrinterSettings {
  const connectionType = parseConnectionType(settings.connectionType)
  const printerHost = settings.printerHost.trim()
  const printerPort = parsePrinterPort(settings.printerPort)

  if (connectionType === 'network' && printerHost && !isValidIpv4(printerHost)) {
    throw new Error('Enter a valid network printer IP address (e.g. 192.168.1.50).')
  }

  const normalized: PrinterSettings = {
    connectionType,
    printerName: settings.printerName.trim(),
    printerHost,
    printerPort,
    printEnabled: settings.printEnabled,
    bureauName: settings.bureauName.trim() || DEFAULT_SETTINGS.bureauName,
    city: settings.city.trim() || DEFAULT_SETTINGS.city
  }
  writeFileSync(getSettingsPath(), JSON.stringify(normalized, null, 2), {
    encoding: 'utf8',
    mode: 0o600
  })
  return normalized
}
