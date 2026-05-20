import { FormEvent, useEffect, useState } from 'react'
import type { PrinterSettings } from '../../shared/printer-types'

export function PrinterSettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<PrinterSettings>({
    printerName: '',
    printEnabled: true,
    bureauName: 'KEMBIM VALUTOR',
    city: 'Durres'
  })
  const [printers, setPrinters] = useState<string[]>([])
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadSettings(): Promise<void> {
      setLoadingSettings(true)
      const printerSettings = await window.api.getPrinterSettings()
      if (
        printerSettings &&
        typeof printerSettings === 'object' &&
        'printerName' in printerSettings
      ) {
        setSettings(printerSettings)
      }
      setLoadingSettings(false)
    }
    void loadSettings()
  }, [])

  async function loadPrinters(): Promise<void> {
    setLoadingPrinters(true)
    const available = await window.api.listPrinters()
    if (Array.isArray(available)) {
      setPrinters(available)
    }
    setLoadingPrinters(false)
  }

  async function handleSave(event: FormEvent): Promise<void> {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setMessage(null)

    const result = await window.api.savePrinterSettings(settings)
    setSaving(false)

    if (!result.success) {
      setError(result.error ?? 'Failed to save printer settings')
      return
    }

    setSettings(result.data)
    setMessage('Printer settings saved.')
    setTimeout(() => setMessage(null), 3000)
  }

  if (loadingSettings) {
    return (
      <section className="settings-section mx-auto max-w-xl">
        <p className="text-sm text-slate-500">Loading printer settings…</p>
      </section>
    )
  }

  return (
    <section className="settings-section mx-auto max-w-xl">
      <h3 className="mb-2 text-base font-semibold text-slate-800">Thermal receipt printer</h3>
      <p className="mb-4 text-sm text-slate-600">
        Receipts print as Albanian <strong>Mandat Konvertim Valute</strong> (invoice number, Shuma /
        Kursi / Shuma e Konvert., boxed total, city and date). Configure your bureau name below.
      </p>

      <form
        onSubmit={handleSave}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={settings.printEnabled}
            onChange={(e) => setSettings((s) => ({ ...s, printEnabled: e.target.checked }))}
            className="rounded border-slate-300"
          />
          Print receipt after each transaction
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="bureau-name" className="mb-1.5 block text-sm font-medium text-slate-700">
              Bureau name (header)
            </label>
            <input
              id="bureau-name"
              type="text"
              value={settings.bureauName}
              onChange={(e) => setSettings((s) => ({ ...s, bureauName: e.target.value }))}
              placeholder="KEMBIM VALUTOR"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            />
          </div>
          <div>
            <label htmlFor="city" className="mb-1.5 block text-sm font-medium text-slate-700">
              City (footer)
            </label>
            <input
              id="city"
              type="text"
              value={settings.city}
              onChange={(e) => setSettings((s) => ({ ...s, city: e.target.value }))}
              placeholder="Durres"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            />
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
            <label htmlFor="printer-name" className="text-sm font-medium text-slate-700">
              Printer name
            </label>
            <button
              type="button"
              onClick={() => void loadPrinters()}
              disabled={loadingPrinters}
              className="text-xs font-medium text-navy-800 hover:underline disabled:opacity-50"
            >
              {loadingPrinters ? 'Scanning…' : printers.length ? 'Refresh list' : 'Load printer list'}
            </button>
          </div>
          {printers.length > 0 ? (
            <select
              id="printer-name"
              value={settings.printerName}
              onChange={(e) => setSettings((s) => ({ ...s, printerName: e.target.value }))}
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            >
              <option value="">Select a printer…</option>
              {printers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id="printer-name"
              type="text"
              value={settings.printerName}
              onChange={(e) => setSettings((s) => ({ ...s, printerName: e.target.value }))}
              placeholder="e.g. POS-58 — or click Load printer list"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            />
          )}
          {printers.length === 0 && !loadingPrinters && (
            <p className="mt-1 text-xs text-slate-500">
              Type the printer name as shown in Windows, or use Load printer list (can take a few
              seconds on Windows).
            </p>
          )}
        </div>

        {error && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
            {error}
          </p>
        )}

        {message && (
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800" role="status">
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-navy-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save printer settings'}
        </button>
      </form>
    </section>
  )
}
