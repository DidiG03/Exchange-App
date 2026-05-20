import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { PrinterSettings } from '../shared/printer-types'

const DEFAULT_SETTINGS: PrinterSettings = {
  printerName: '',
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

export function getPrinterSettings(): PrinterSettings {
  const path = getSettingsPath()
  if (!existsSync(path)) {
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const raw = readFileSync(path, 'utf8')
    const parsed = JSON.parse(raw) as Partial<PrinterSettings>
    return {
      printerName: typeof parsed.printerName === 'string' ? parsed.printerName : '',
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
  const normalized: PrinterSettings = {
    printerName: settings.printerName.trim(),
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
