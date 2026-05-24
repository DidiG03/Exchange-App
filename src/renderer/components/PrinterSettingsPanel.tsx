import { FormEvent, useEffect, useState } from 'react'
import type { NetworkPrinterDevice, PrinterSettings } from '../../shared/printer-types'

const DEFAULT_SETTINGS: PrinterSettings = {
  connectionType: 'system',
  printerName: '',
  printerHost: '',
  printerPort: 9100,
  printEnabled: true,
  bureauName: 'KEMBIM VALUTOR',
  city: 'Durres'
}

export function PrinterSettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_SETTINGS)
  const [printers, setPrinters] = useState<string[]>([])
  const [networkPrinters, setNetworkPrinters] = useState<NetworkPrinterDevice[]>([])
  const [loadingSettings, setLoadingSettings] = useState(true)
  const [loadingPrinters, setLoadingPrinters] = useState(false)
  const [loadingNetworkPrinters, setLoadingNetworkPrinters] = useState(false)
  const [testingNetwork, setTestingNetwork] = useState(false)
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
        setSettings({
          ...DEFAULT_SETTINGS,
          ...printerSettings,
          connectionType:
            printerSettings.connectionType === 'network' ? 'network' : 'system',
          printerPort:
            typeof printerSettings.printerPort === 'number' &&
            printerSettings.printerPort >= 1 &&
            printerSettings.printerPort <= 65535
              ? printerSettings.printerPort
              : 9100
        })
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

  async function loadNetworkPrinters(): Promise<void> {
    setLoadingNetworkPrinters(true)
    setError(null)
    setMessage(null)
    const knownHost = settings.printerHost.trim() || undefined
    const available = await window.api.listNetworkPrinters(knownHost)
    if (Array.isArray(available)) {
      setNetworkPrinters(available)
      if (available.length === 0) {
        setMessage(
          knownHost
            ? `Scan finished — no open raw-print ports found on the network. You can still save ${knownHost} and use Test connection.`
            : 'Scan finished — no printers found. Enter the printer IP below and use Test connection.'
        )
      } else if (knownHost && available.some((device) => device.host === knownHost)) {
        setMessage(`Found your printer at ${knownHost}.`)
      }
    }
    setLoadingNetworkPrinters(false)
  }

  async function testNetworkConnection(): Promise<void> {
    setTestingNetwork(true)
    setError(null)
    setMessage(null)

    const result = await window.api.testNetworkPrinter(
      settings.printerHost.trim(),
      settings.printerPort
    )

    setTestingNetwork(false)

    if (!result || typeof result !== 'object' || !('success' in result)) return

    if (result.success) {
      if (result.port && result.port !== settings.printerPort) {
        setSettings((current) => ({ ...current, printerPort: result.port! }))
      }
      setMessage(
        result.port
          ? `Printer reachable at ${settings.printerHost.trim()}:${result.port}. Save settings to use it.`
          : `Printer reachable at ${settings.printerHost.trim()}. Save settings to use it.`
      )
      return
    }

    setError(result.error ?? 'Could not connect to the printer.')
  }

  function selectNetworkPrinter(device: NetworkPrinterDevice): void {
    setSettings((current) => ({
      ...current,
      connectionType: 'network',
      printerHost: device.host,
      printerPort: device.port
    }))
    setError(null)
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

  const isNetwork = settings.connectionType === 'network'

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

        <fieldset className="space-y-3 rounded-lg border border-slate-200 p-4">
          <legend className="px-1 text-sm font-medium text-slate-700">Printer connection</legend>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="printer-connection"
              checked={!isNetwork}
              onChange={() => setSettings((s) => ({ ...s, connectionType: 'system' }))}
            />
            Local printer (installed in Windows)
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="radio"
              name="printer-connection"
              checked={isNetwork}
              onChange={() => setSettings((s) => ({ ...s, connectionType: 'network' }))}
            />
            Network printer (LAN / Wi‑Fi)
          </label>
        </fieldset>

        {!isNetwork ? (
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
                {loadingPrinters
                  ? 'Scanning…'
                  : printers.length
                    ? 'Refresh list'
                    : 'Load printer list'}
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
                seconds).
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-slate-700">LAN printers</span>
                <button
                  type="button"
                  onClick={() => void loadNetworkPrinters()}
                  disabled={loadingNetworkPrinters}
                  className="text-xs font-medium text-navy-800 hover:underline disabled:opacity-50"
                >
                  {loadingNetworkPrinters
                    ? 'Scanning network…'
                    : networkPrinters.length
                      ? 'Scan again'
                      : 'Scan LAN for printers'}
                </button>
              </div>
              {loadingNetworkPrinters && (
                <p className="text-xs text-slate-500">
                  Scanning for raw printing on ports 9100–9102
                  {settings.printerHost.trim() ? ` (including ${settings.printerHost.trim()})` : ''}.
                  This can take up to 15 seconds.
                </p>
              )}
              {networkPrinters.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                  {networkPrinters.map((device) => {
                    const selected =
                      settings.printerHost === device.host && settings.printerPort === device.port
                    return (
                      <li key={device.label}>
                        <button
                          type="button"
                          onClick={() => selectNetworkPrinter(device)}
                          className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                            selected
                              ? 'bg-navy-900 text-white'
                              : 'bg-slate-50 text-slate-800 hover:bg-slate-100'
                          }`}
                        >
                          {device.label}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {!loadingNetworkPrinters && networkPrinters.length === 0 && (
                <p className="text-xs text-slate-500">
                  Scan is optional. If you already know the IP, enter it below and click Test
                  connection. Many thermal printers use port 9100.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
              <div>
                <label
                  htmlFor="printer-host"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Printer IP address
                </label>
                <input
                  id="printer-host"
                  type="text"
                  inputMode="decimal"
                  value={settings.printerHost}
                  onChange={(e) => setSettings((s) => ({ ...s, printerHost: e.target.value }))}
                  placeholder="192.168.1.50"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
                />
              </div>
              <div>
                <label
                  htmlFor="printer-port"
                  className="mb-1.5 block text-sm font-medium text-slate-700"
                >
                  Port
                </label>
                <input
                  id="printer-port"
                  type="number"
                  min={1}
                  max={65535}
                  value={settings.printerPort}
                  onChange={(e) =>
                    setSettings((s) => ({
                      ...s,
                      printerPort: Number(e.target.value) || 9100
                    }))
                  }
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-navy-700 focus:ring-2 focus:ring-navy-700"
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void testNetworkConnection()}
                disabled={testingNetwork || !settings.printerHost.trim()}
                className="rounded-lg border border-navy-800 px-4 py-2 text-sm font-medium text-navy-900 hover:bg-slate-50 disabled:opacity-50"
              >
                {testingNetwork ? 'Testing…' : 'Test connection'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Enter the IP from the printer’s network settings, test the connection, then save. The
              Windows PC must be on the same Wi‑Fi/LAN as the printer.
            </p>
          </div>
        )}

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
