import { useEffect, useState } from 'react'
import type { UpdateState } from '../../shared/updater-types'

export function UpdatePanel(): React.JSX.Element {
  const [state, setState] = useState<UpdateState | null>(null)
  const [checking, setChecking] = useState(false)

  useEffect(() => {
    void window.api.getUpdateState().then(setState)
    return window.api.onUpdateState(setState)
  }, [])

  async function handleCheck(): Promise<void> {
    setChecking(true)
    const next = await window.api.checkForUpdates()
    setState(next)
    setChecking(false)
  }

  async function handleInstall(): Promise<void> {
    await window.api.installUpdate()
  }

  const isBusy = checking || state?.status === 'checking' || state?.status === 'downloading'
  const canInstall = state?.status === 'downloaded'

  return (
    <section className="mx-auto max-w-xl">
      <h3 className="mb-2 text-base font-semibold text-slate-800">App updates</h3>
      <p className="mb-4 text-sm text-slate-600">
        The installed app checks GitHub for new versions automatically. When an update is ready,
        staff can restart to install — no need to uninstall and reinstall manually.
      </p>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-500">Current version</p>
            <p className="text-lg font-semibold text-slate-900">
              v{state?.currentVersion ?? '…'}
            </p>
          </div>
          {state?.availableVersion && state.status !== 'not-available' && (
            <div className="text-right">
              <p className="text-sm text-slate-500">Available</p>
              <p className="text-lg font-semibold text-navy-900">v{state.availableVersion}</p>
            </div>
          )}
        </div>

        {state?.message && (
          <p
            className={`rounded-lg px-3 py-2 text-sm ${
              state.status === 'error'
                ? 'bg-red-50 text-red-700'
                : state.status === 'downloaded'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-slate-50 text-slate-700'
            }`}
          >
            {state.message}
          </p>
        )}

        {state?.status === 'downloading' && state.percent !== undefined && (
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-navy-900 transition-all"
              style={{ width: `${state.percent}%` }}
            />
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={isBusy || state?.status === 'unsupported'}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {checking ? 'Checking…' : 'Check for updates'}
          </button>

          {canInstall && (
            <button
              type="button"
              onClick={() => void handleInstall()}
              className="rounded-lg bg-navy-900 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-800"
            >
              Restart & install
            </button>
          )}
        </div>

        {state?.status === 'unsupported' && (
          <p className="text-xs text-slate-500">
            Auto-update only runs in the packaged .exe installed on Windows, not in dev mode.
          </p>
        )}
      </div>
    </section>
  )
}
