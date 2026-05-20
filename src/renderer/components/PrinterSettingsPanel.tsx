import { FormEvent, useEffect, useState } from 'react'
import type { PrinterSettings } from '../../shared/printer-types'

export function PrinterSettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<PrinterSettings>({
    printerName: '',
    printEnabled: true
  })
  const [printers, setPrinters] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true)
      const [printerSettings, available] = await Promise.all([
        window.api.getPrinterSettings(),
        window.api.listPrinters()
      ])
      if (
        printerSettings &&
        typeof printerSettings === 'object' &&
        'printerName' in printerSettings
      ) {
        setSettings(printerSettings)
      }
      if (Array.isArray(available)) {
        setPrinters(available)
      }
      setLoading(false)
    }
    void load()
  }, [])

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

  if (loading) {
    return <p className="text-sm text-slate-500">Loading printer settings…</p>
  }

  return (
    <section className="mx-auto max-w-xl">
      <h3 className="mb-2 text-base font-semibold text-slate-800">Thermal receipt printer</h3>
      <p className="mb-4 text-sm text-slate-600">
        Connect your USB thermal printer and install its driver. Select the exact printer name
        from the list (macOS: System Settings → Printers; Windows: Settings → Printers). Receipts
        are sent as RAW ESC/POS — not through the normal PDF print dialog.
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

        <div>
          <label htmlFor="printer-name" className="mb-1.5 block text-sm font-medium text-slate-700">
            Printer name (as shown in Windows)
          </label>
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
              placeholder="e.g. POS-58"
              className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
            />
          )}
          {printers.length === 0 && (
            <p className="mt-1 text-xs text-slate-500">
              No system printers detected. Type the name exactly as in Windows Printers.
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
